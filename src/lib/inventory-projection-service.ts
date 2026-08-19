import {
  InventoryEventStatus,
  InventoryEventType,
  type PrismaClient,
} from "@prisma/client";

import {
  assertCompanyWarehouseScopeWithClient,
} from "@/lib/inventory-event-service";
import {
  applyPendingIncomingToPurchaseEvents,
  applyRemainingPiQtyToBookingReservations,
  filterEventsForLivePhysicalProjection,
  type InventoryEvent,
} from "@/lib/inventory-events";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import {
  calculateInventoryProjection as projectInventory,
  findEarliestAvailabilityDate,
  type InventoryProjectionDay,
} from "@/lib/inventory-projection";
import { prisma } from "@/lib/prisma";
import { resolveSafetyQty } from "@/lib/safety-stock";
import { addCalendarDays } from "@/lib/working-days";

const DEFAULT_AVAILABILITY_HORIZON_DAYS = 365;

function dateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return addCalendarDays(value, 0);
  }
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date.");
  return value.toISOString().slice(0, 10);
}

function dateAtUtcMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export type ProjectInventoryInput = {
  companyId: string;
  warehouseId: string;
  productId: string;
  startDate: Date | string;
  endDate: Date | string;
};

export function createInventoryProjectionService(
  client: PrismaClient = prisma,
  stockLoader = getWarehouseStockForProduct,
) {
  async function loadProjection(
    input: ProjectInventoryInput,
  ): Promise<InventoryProjectionDay[]> {
    const startDate = dateOnly(input.startDate);
    const endDate = dateOnly(input.endDate);
    if (startDate > endDate) {
      throw new RangeError("Projection start date cannot be after end date.");
    }

    await assertCompanyWarehouseScopeWithClient(
      client,
      input.companyId,
      input.warehouseId,
    );

    const [stock, safetyOverride, rows] = await Promise.all([
      stockLoader(
        client,
        input.companyId,
        input.productId,
        input.warehouseId,
      ),
      client.inventorySafetyStock.findFirst({
        where: {
          companyId: input.companyId,
          warehouseId: input.warehouseId,
          productId: input.productId,
          isActive: true,
          effectiveFrom: { lte: dateAtUtcMidnight(startDate) },
        },
        orderBy: { effectiveFrom: "desc" },
      }),
      client.inventoryEvent.findMany({
        where: {
          companyId: input.companyId,
          warehouseId: input.warehouseId,
          productId: input.productId,
          status: {
            in: [
              InventoryEventStatus.ACTIVE,
              InventoryEventStatus.COMPLETED,
            ],
          },
          OR: [
            {
              // Include past bookings so commitments already started reduce opening stock.
              effectiveDate: {
                lte: dateAtUtcMidnight(endDate),
              },
            },
            {
              expectedMinDate: {
                lte: dateAtUtcMidnight(endDate),
              },
            },
            {
              expectedMaxDate: {
                lte: dateAtUtcMidnight(endDate),
              },
            },
          ],
        },
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const events: InventoryEvent[] = rows.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      quantity: Number(event.quantity),
      effectiveDate: dateOnly(event.effectiveDate),
      expectedMinDate: event.expectedMinDate
        ? dateOnly(event.expectedMinDate)
        : null,
      expectedMaxDate: event.expectedMaxDate
        ? dateOnly(event.expectedMaxDate)
        : null,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      sourceNumber: event.sourceNumber,
      replacesEventId: event.replacesEventId,
    }));

    const purchaseLotIds = [
      ...new Set(
        events
          .filter(
            (event) =>
              event.eventType === InventoryEventType.PURCHASE_INCOMING &&
              event.sourceType === "INVENTORY_LOT" &&
              event.sourceId,
          )
          .map((event) => event.sourceId as string),
      ),
    ];
    const actualDispatchIds = [
      ...new Set(
        events
          .filter(
            (event) =>
              event.eventType === InventoryEventType.ACTUAL_DISPATCH &&
              event.sourceType === "DISPATCH" &&
              event.sourceId,
          )
          .map((event) => event.sourceId as string),
      ),
    ];
    const [purchaseLots, dispatches] = await Promise.all([
      purchaseLotIds.length === 0
        ? Promise.resolve([])
        : client.inventoryLot.findMany({
            where: { id: { in: purchaseLotIds } },
            select: {
              id: true,
              quantity: true,
              receivedQuantity: true,
              damagedQuantity: true,
            },
          }),
      actualDispatchIds.length === 0
        ? Promise.resolve([])
        : client.dispatch.findMany({
            where: { id: { in: actualDispatchIds } },
            select: { id: true, proformaInvoiceId: true },
          }),
    ]);
    const lotsById = new Map(
      purchaseLots.map((lot) => [
        lot.id,
        {
          quantity: Number(lot.quantity),
          receivedQuantity: Number(lot.receivedQuantity),
          damagedQuantity: Number(lot.damagedQuantity),
        },
      ]),
    );
    const dispatchToPiId = new Map(
      dispatches.map((row) => [row.id, row.proformaInvoiceId]),
    );
    const dispatchedQtyByPiId = new Map<string, number>();
    for (const event of events) {
      if (
        event.eventType !== InventoryEventType.ACTUAL_DISPATCH ||
        event.sourceType !== "DISPATCH" ||
        !event.sourceId
      ) {
        continue;
      }
      const piId = dispatchToPiId.get(event.sourceId);
      if (!piId) continue;
      dispatchedQtyByPiId.set(
        piId,
        (dispatchedQtyByPiId.get(piId) ?? 0) + event.quantity,
      );
    }

    // Cap reservation events at what each PI actually needs for this product.
    // Guards against historical over-reservations (e.g. Math.ceil rounding).
    const reservationPiIds = [
      ...new Set(
        events
          .filter(
            (event) =>
              event.eventType === InventoryEventType.BOOKING_RESERVATION &&
              event.sourceType === "PROFORMA_INVOICE" &&
              event.sourceId,
          )
          .map((event) => event.sourceId as string),
      ),
    ];
    const remainingByPiId = new Map<string, number>();
    if (reservationPiIds.length > 0) {
      const piItems = await client.proformaInvoiceItem.findMany({
        where: {
          piId: { in: reservationPiIds },
          productId: input.productId,
        },
        select: { piId: true, qty: true },
      });
      for (const item of piItems) {
        remainingByPiId.set(
          item.piId,
          (remainingByPiId.get(item.piId) ?? 0) + Number(item.qty),
        );
      }
    }

    const adjustedEvents = applyRemainingPiQtyToBookingReservations(
      applyPendingIncomingToPurchaseEvents(events, lotsById),
      remainingByPiId,
    );

    // Include booked serials in physical baseline; BOOKING_RESERVATION events
    // reduce sales-available stock on the committed dispatch start date.
    // Filter against live physical so dispatched stock is not deducted again.
    return projectInventory({
      physicalStock: stock.availableStock + stock.bookedStock,
      safetyStock: resolveSafetyQty(
        safetyOverride ? Number(safetyOverride.safetyQty) : null,
      ),
      startDate,
      endDate,
      events: filterEventsForLivePhysicalProjection(
        adjustedEvents,
        dispatchedQtyByPiId,
      ),
    });
  }

  return {
    projectInventory: loadProjection,

    async getEarliestAvailabilityDate(
      companyId: string,
      warehouseId: string,
      productId: string,
      quantity: number,
    ) {
      const startDate = new Date().toISOString().slice(0, 10);
      const projection = await loadProjection({
        companyId,
        warehouseId,
        productId,
        startDate,
        endDate: addCalendarDays(
          startDate,
          DEFAULT_AVAILABILITY_HORIZON_DAYS,
        ),
      });
      return findEarliestAvailabilityDate(projection, quantity);
    },
  };
}

const defaultService = createInventoryProjectionService();

export const getInventoryProjection = defaultService.projectInventory;
export const getEarliestAvailabilityDate =
  defaultService.getEarliestAvailabilityDate;
