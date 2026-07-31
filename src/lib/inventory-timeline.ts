import {
  DispatchStatus,
  InventoryEventStatus,
  LotStatus,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";

import {
  calculateInventoryProjection,
  getArrivalWindowDisplayData,
} from "@/lib/inventory-projection";
import {
  applyPendingIncomingToPurchaseEvents,
  getInventoryEventProjectionDate,
  getSupersededInventoryEventIds,
  type DispatchTodayEventStatus,
  type InventoryEvent,
} from "@/lib/inventory-events";
import { pendingIncomingQuantity } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { resolveSafetyQty } from "@/lib/safety-stock";
import { addCalendarDays } from "@/lib/working-days";

export const INVENTORY_TIMELINE_DAYS = 15;

export type InventoryTimelineDay = {
  date: string;
  opening: number;
  incoming: number;
  outgoing: number;
  /** Units actually dispatched this day (informational; already in physical). */
  dispatched: number;
  closing: number;
  events: InventoryEvent[];
};

export type InventoryTimelineItem = {
  key: string;
  productId: string;
  productName: string;
  brandName: string;
  categoryName: string;
  companyIds: string[];
  companyNames: string[];
  warehouseIds: string[];
  warehouseNames: string[];
  physical: number;
  reserved: number;
  incoming: number;
  safety: number;
  netAvailableToday: number;
  days: InventoryTimelineDay[];
  arrivalWindows: ReturnType<typeof getArrivalWindowDisplayData>;
  events: InventoryEvent[];
};

export type InventoryTimelineResponse = {
  startDate: string;
  endDate: string;
  combined: boolean;
  items: InventoryTimelineItem[];
  totals: {
    physical: number;
    reserved: number;
    incoming: number;
    safety: number;
    netAvailableToday: number;
  };
};

export function getInventoryTimelineDateRange(today = new Date()) {
  const startDate = today.toISOString().slice(0, 10);
  return {
    startDate,
    endDate: addCalendarDays(startDate, INVENTORY_TIMELINE_DAYS - 1),
  };
}

export function summarizeInventoryTimeline(
  items: readonly Pick<
    InventoryTimelineItem,
    "physical" | "reserved" | "incoming" | "safety" | "netAvailableToday"
  >[],
) {
  return items.reduce(
    (totals, item) => ({
      physical: totals.physical + item.physical,
      reserved: totals.reserved + item.reserved,
      incoming: totals.incoming + item.incoming,
      safety: totals.safety + item.safety,
      netAvailableToday:
        totals.netAvailableToday + item.netAvailableToday,
    }),
    {
      physical: 0,
      reserved: 0,
      incoming: 0,
      safety: 0,
      netAvailableToday: 0,
    },
  );
}

type TimelineQuery = {
  companyIds: string[];
  warehouseId?: string;
  productId?: string;
  combined: boolean;
  startDate: string;
  endDate: string;
};

type TimelineScope = {
  companyId: string;
  warehouseId: string;
  productId: string;
  physical: number;
  incoming: number;
  safety: number;
  events: InventoryEvent[];
};

export type DispatchTodayPiInfo = {
  status: DispatchTodayEventStatus;
  fullQuantity: number;
  customerName: string;
  piNo: string;
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function scopeKey(companyId: string, warehouseId: string, productId: string) {
  return `${companyId}:${warehouseId}:${productId}`;
}

function isDispatchTodayReservation(
  event: InventoryEvent,
  dispatchTodayByPiId: ReadonlyMap<string, DispatchTodayPiInfo>,
): DispatchTodayPiInfo | null {
  if (
    event.eventType !== "BOOKING_RESERVATION" ||
    event.sourceType !== "PROFORMA_INVOICE" ||
    !event.sourceId
  ) {
    return null;
  }
  return dispatchTodayByPiId.get(event.sourceId) ?? null;
}

/**
 * Reserved baseline excludes Dispatch Today PIs so they appear as same-day
 * outgoing (Pending) instead of being double-counted in opening reserved stock.
 * Dispatched PIs are also excluded — physical already reflects the DC.
 */
export function computeTimelineReservedQuantity(
  events: readonly InventoryEvent[],
  superseded: ReadonlySet<string>,
  startDate: string,
  dispatchTodayByPiId: ReadonlyMap<string, DispatchTodayPiInfo>,
): number {
  let reserved = 0;
  for (const event of events) {
    if (superseded.has(event.id)) continue;
    if (event.eventType !== "BOOKING_RESERVATION") continue;
    if (isDispatchTodayReservation(event, dispatchTodayByPiId)) continue;
    if (getInventoryEventProjectionDate(event) <= startDate) {
      reserved += event.quantity;
    }
  }
  return reserved;
}

/**
 * Today’s projection includes Pending Dispatch Today reservations as outgoing.
 * Other same-day reservations stay in the reserved baseline.
 */
export function selectTimelineProjectionEvents(
  events: readonly InventoryEvent[],
  superseded: ReadonlySet<string>,
  startDate: string,
  dispatchTodayByPiId: ReadonlyMap<string, DispatchTodayPiInfo>,
): InventoryEvent[] {
  const selected: InventoryEvent[] = [];
  for (const event of events) {
    if (superseded.has(event.id)) continue;

    const dispatchToday = isDispatchTodayReservation(event, dispatchTodayByPiId);
    if (dispatchToday?.status === "Pending") {
      // Force onto today so Opening/Outgoing reflect Dispatch Today even if
      // reservation window dates have not been refreshed yet.
      selected.push({
        ...event,
        expectedMinDate: startDate,
        expectedMaxDate: startDate,
      });
      continue;
    }

    const projectionDate = getInventoryEventProjectionDate(event);
    if (projectionDate > startDate) {
      selected.push(event);
      continue;
    }
    if (projectionDate < startDate) continue;

    if (
      event.eventType !== "BOOKING_RESERVATION" &&
      event.eventType !== "BOOKING_RELEASE" &&
      event.eventType !== "ACTUAL_DISPATCH"
    ) {
      selected.push(event);
    }
  }
  return selected;
}

export function enrichTimelineDayEvents(
  dayEvents: readonly InventoryEvent[],
  allEvents: readonly InventoryEvent[],
  superseded: ReadonlySet<string>,
  dayDate: string,
  startDate: string,
  dispatchTodayByPiId: ReadonlyMap<string, DispatchTodayPiInfo>,
): InventoryEvent[] {
  const enriched = dayEvents.map((event) => {
    const dispatchToday = isDispatchTodayReservation(event, dispatchTodayByPiId);
    if (!dispatchToday) return event;
    return {
      ...event,
      dispatchTodayStatus: dispatchToday.status,
      displayQuantity: dispatchToday.fullQuantity,
      customerName: dispatchToday.customerName,
      sourceNumber: dispatchToday.piNo,
    };
  });

  if (dayDate !== startDate) return enriched;

  const seenPiIds = new Set(
    enriched
      .filter((event) => event.sourceType === "PROFORMA_INVOICE" && event.sourceId)
      .map((event) => event.sourceId as string),
  );

  // Dispatched Dispatch Today rows are excluded from projection math but still
  // listed in today’s details so the warehouse can see completed marks.
  for (const event of allEvents) {
    if (superseded.has(event.id)) continue;
    const dispatchToday = isDispatchTodayReservation(event, dispatchTodayByPiId);
    if (!dispatchToday || dispatchToday.status !== "Dispatched") continue;
    if (!event.sourceId || seenPiIds.has(event.sourceId)) continue;
    if (getInventoryEventProjectionDate(event) > startDate) continue;

    seenPiIds.add(event.sourceId);
    enriched.push({
      ...event,
      dispatchTodayStatus: "Dispatched",
      displayQuantity: dispatchToday.fullQuantity,
      customerName: dispatchToday.customerName,
      sourceNumber: dispatchToday.piNo,
    });
  }

  // Order: pending reservations first, then dispatched (dispatch sequence).
  return enriched.sort((a, b) => {
    const aDone = a.dispatchTodayStatus === "Dispatched" ? 1 : 0;
    const bDone = b.dispatchTodayStatus === "Dispatched" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return a.effectiveDate.localeCompare(b.effectiveDate);
  });
}

/** Sum of ACTUAL_DISPATCH quantities whose projection date falls on `dayDate`. */
export function sumDispatchedQuantityForDay(
  events: readonly InventoryEvent[],
  superseded: ReadonlySet<string>,
  dayDate: string,
): number {
  let total = 0;
  for (const event of events) {
    if (superseded.has(event.id)) continue;
    if (event.eventType !== "ACTUAL_DISPATCH") continue;
    if (getInventoryEventProjectionDate(event) !== dayDate) continue;
    total += event.quantity;
  }
  return total;
}

export async function loadInventoryTimeline(
  input: TimelineQuery,
  client: PrismaClient = prisma,
): Promise<InventoryTimelineResponse> {
  const warehouseWhere = {
    companyId: { in: input.companyIds },
    isActive: true,
    ...(input.warehouseId ? { id: input.warehouseId } : {}),
  };
  const warehouses = await client.warehouse.findMany({
    where: warehouseWhere,
    select: {
      id: true,
      name: true,
      companyId: true,
      company: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);

  if (warehouseIds.length === 0) {
    return {
      startDate: input.startDate,
      endDate: input.endDate,
      combined: input.combined,
      items: [],
      totals: summarizeInventoryTimeline([]),
    };
  }

  const productWhere = {
    isActive: true,
    ...(input.productId ? { id: input.productId } : {}),
  };
  const [products, lots, serialGroups, eventRows, safetyRows] =
    await Promise.all([
      client.product.findMany({
        where: productWhere,
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { displayName: "asc" },
      }),
      client.inventoryLot.findMany({
        where: {
          companyId: { in: input.companyIds },
          warehouseId: { in: warehouseIds },
          ...(input.productId ? { productId: input.productId } : {}),
        },
        select: {
          id: true,
          companyId: true,
          warehouseId: true,
          productId: true,
          quantity: true,
          receivedQuantity: true,
          damagedQuantity: true,
          status: true,
        },
      }),
      client.inventorySerial.groupBy({
        by: ["productId", "currentWarehouseId", "status"],
        where: {
          currentWarehouseId: { in: warehouseIds },
          ...(input.productId ? { productId: input.productId } : {}),
          lot: { companyId: { in: input.companyIds } },
        },
        _count: { _all: true },
      }),
      client.inventoryEvent.findMany({
        where: {
          companyId: { in: input.companyIds },
          warehouseId: { in: warehouseIds },
          ...(input.productId ? { productId: input.productId } : {}),
          status: {
            in: [
              InventoryEventStatus.ACTIVE,
              InventoryEventStatus.COMPLETED,
            ],
          },
          effectiveDate: {
            lte: new Date(`${input.endDate}T00:00:00.000Z`),
          },
        },
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      }),
      client.inventorySafetyStock.findMany({
        where: {
          companyId: { in: input.companyIds },
          warehouseId: { in: warehouseIds },
          ...(input.productId ? { productId: input.productId } : {}),
          isActive: true,
          effectiveFrom: {
            lte: new Date(`${input.startDate}T00:00:00.000Z`),
          },
        },
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const warehouseById = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse]),
  );
  const lotsById = new Map(
    lots.map((lot) => [
      lot.id,
      {
        quantity: Number(lot.quantity),
        receivedQuantity: Number(lot.receivedQuantity),
        damagedQuantity: Number(lot.damagedQuantity),
      },
    ]),
  );
  const piSourceIds = [
    ...new Set(
      eventRows
        .filter(
          (row) =>
            row.sourceType === "PROFORMA_INVOICE" && Boolean(row.sourceId),
        )
        .map((row) => row.sourceId as string),
    ),
  ];
  const piCustomerById = new Map<string, string>();
  const dispatchTodayByPiId = new Map<string, DispatchTodayPiInfo>();
  const todayDate = new Date(`${input.startDate}T00:00:00.000Z`);
  const [sourcePis, dispatchTodayPis, todaysDispatchedDcs] = await Promise.all([
    piSourceIds.length > 0
      ? client.proformaInvoice.findMany({
          where: { id: { in: piSourceIds } },
          select: {
            id: true,
            customer: { select: { customerName: true } },
          },
        })
      : Promise.resolve([]),
    client.proformaInvoice.findMany({
      where: {
        companyId: { in: input.companyIds },
        dispatchTodayDate: todayDate,
      },
      select: {
        id: true,
        piNo: true,
        customer: { select: { customerName: true } },
        items: { select: { qty: true, dispatchedQty: true } },
        dispatches: {
          where: { status: DispatchStatus.DISPATCHED },
          select: { id: true },
          take: 1,
        },
      },
    }),
    // PIs dispatched today even if Dispatch Today was never flagged — so the
    // day panel can list them as Dispatched and keep them out of reserved.
    client.dispatch.findMany({
      where: {
        companyId: { in: input.companyIds },
        status: DispatchStatus.DISPATCHED,
        dispatchDate: todayDate,
      },
      select: {
        proformaInvoice: {
          select: {
            id: true,
            piNo: true,
            customer: { select: { customerName: true } },
            items: { select: { qty: true, dispatchedQty: true } },
          },
        },
      },
    }),
  ]);
  for (const pi of sourcePis) {
    piCustomerById.set(pi.id, pi.customer.customerName);
  }
  for (const pi of dispatchTodayPis) {
    const fullQuantity = pi.items.reduce(
      (sum, item) => sum + Number(item.qty),
      0,
    );
    const hasDispatchedDc = pi.dispatches.length > 0;
    const fullyDispatched = pi.items.every(
      (item) => Number(item.dispatchedQty) >= Number(item.qty),
    );
    dispatchTodayByPiId.set(pi.id, {
      status: hasDispatchedDc || fullyDispatched ? "Dispatched" : "Pending",
      fullQuantity,
      customerName: pi.customer.customerName,
      piNo: pi.piNo,
    });
    piCustomerById.set(pi.id, pi.customer.customerName);
  }
  for (const dc of todaysDispatchedDcs) {
    const pi = dc.proformaInvoice;
    if (dispatchTodayByPiId.has(pi.id)) continue;
    const fullQuantity = pi.items.reduce(
      (sum, item) => sum + Number(item.qty),
      0,
    );
    dispatchTodayByPiId.set(pi.id, {
      status: "Dispatched",
      fullQuantity,
      customerName: pi.customer.customerName,
      piNo: pi.piNo,
    });
    piCustomerById.set(pi.id, pi.customer.customerName);
  }
  const scopeData = new Map<string, TimelineScope>();

  function getScope(companyId: string, warehouseId: string, productId: string) {
    const key = scopeKey(companyId, warehouseId, productId);
    let value = scopeData.get(key);
    if (!value) {
      value = {
        companyId,
        warehouseId,
        productId,
        physical: 0,
        incoming: 0,
        safety: 0,
        events: [],
      };
      scopeData.set(key, value);
    }
    return value;
  }

  for (const lot of lots) {
    const product = productById.get(lot.productId);
    if (!product) continue;
    const scope = getScope(lot.companyId, lot.warehouseId, lot.productId);
    const received = Number(lot.receivedQuantity);
    const damaged = Number(lot.damagedQuantity);
    const quantity = Number(lot.quantity);
    if (lot.status === LotStatus.INCOMING) {
      scope.incoming += pendingIncomingQuantity({
        quantity,
        receivedQuantity: received,
        damagedQuantity: damaged,
      });
    }
    if (product.serialTracking) continue;
    scope.physical += Math.max(0, received - damaged);
  }

  for (const group of serialGroups) {
    const warehouse = warehouseById.get(group.currentWarehouseId);
    if (!warehouse) continue;
    const scope = getScope(
      warehouse.companyId,
      group.currentWarehouseId,
      group.productId,
    );
    if (
      group.status === SerialStatus.AVAILABLE ||
      group.status === SerialStatus.BOOKED
    ) {
      // BOOKED serials stay in physical until commitment; reservation events
      // reduce sales-available stock on the committed dispatch start date.
      scope.physical += group._count._all;
    }
  }

  const seenSafetyScopes = new Set<string>();
  for (const row of safetyRows) {
    const key = scopeKey(row.companyId, row.warehouseId, row.productId);
    if (seenSafetyScopes.has(key)) continue;
    seenSafetyScopes.add(key);
    getScope(row.companyId, row.warehouseId, row.productId).safety =
      resolveSafetyQty(Number(row.safetyQty));
  }

  for (const row of eventRows) {
    const event: InventoryEvent = {
      id: row.id,
      eventType: row.eventType,
      status: row.status,
      quantity: Number(row.quantity),
      effectiveDate: dateOnly(row.effectiveDate),
      expectedMinDate: row.expectedMinDate
        ? dateOnly(row.expectedMinDate)
        : null,
      expectedMaxDate: row.expectedMaxDate
        ? dateOnly(row.expectedMaxDate)
        : null,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceNumber: row.sourceNumber,
      customerName:
        row.sourceType === "PROFORMA_INVOICE" && row.sourceId
          ? (piCustomerById.get(row.sourceId) ?? null)
          : null,
      replacesEventId: row.replacesEventId,
    };
    const [adjustedEvent] = applyPendingIncomingToPurchaseEvents(
      [event],
      lotsById,
    );
    const scope = getScope(row.companyId, row.warehouseId, row.productId);
    scope.events.push(adjustedEvent);
  }

  const grouped = new Map<string, TimelineScope[]>();
  for (const scope of scopeData.values()) {
    if (!productById.has(scope.productId)) continue;
    const key = input.combined
      ? scope.productId
      : `${scope.companyId}:${scope.productId}`;
    const rows = grouped.get(key) ?? [];
    rows.push(scope);
    grouped.set(key, rows);
  }

  const items: InventoryTimelineItem[] = [];
  for (const [key, scopes] of grouped) {
    const product = productById.get(scopes[0].productId);
    if (!product) continue;
    const events = scopes.flatMap((scope) => scope.events);
    const superseded = getSupersededInventoryEventIds(events);
    const reserved = computeTimelineReservedQuantity(
      events,
      superseded,
      input.startDate,
      dispatchTodayByPiId,
    );
    const physical = scopes.reduce((sum, scope) => sum + scope.physical, 0);
    const incoming = scopes.reduce((sum, scope) => sum + scope.incoming, 0);
    const safety = scopes.reduce((sum, scope) => sum + scope.safety, 0);
    const futureEvents = selectTimelineProjectionEvents(
      events,
      superseded,
      input.startDate,
      dispatchTodayByPiId,
    );
    const projection = calculateInventoryProjection({
      physicalStock: Math.max(0, physical - reserved),
      safetyStock: safety,
      startDate: input.startDate,
      endDate: input.endDate,
      events: futureEvents,
    });
    const companyIds = [...new Set(scopes.map((scope) => scope.companyId))];
    const warehouseScopeIds = [
      ...new Set(scopes.map((scope) => scope.warehouseId)),
    ];

    items.push({
      key,
      productId: product.id,
      productName: product.displayName,
      brandName: product.brand.name,
      categoryName: product.category.name,
      companyIds,
      companyNames: companyIds.map(
        (id) =>
          warehouses.find((warehouse) => warehouse.companyId === id)?.company
            .name ?? id,
      ),
      warehouseIds: warehouseScopeIds,
      warehouseNames: warehouseScopeIds.map(
        (id) => warehouseById.get(id)?.name ?? id,
      ),
      physical,
      reserved,
      incoming,
      safety,
      netAvailableToday:
        projection[0]?.projectedAvailableQuantity ?? physical - reserved - safety,
      days: projection.map((day) => ({
        date: day.date,
        opening: day.openingQuantity,
        incoming: day.incomingQuantity,
        outgoing: day.outgoingQuantity,
        dispatched: sumDispatchedQuantityForDay(
          events,
          superseded,
          day.date,
        ),
        closing: day.projectedAvailableQuantity,
        events: enrichTimelineDayEvents(
          day.events,
          events,
          superseded,
          day.date,
          input.startDate,
          dispatchTodayByPiId,
        ),
      })),
      arrivalWindows: getArrivalWindowDisplayData(
        events,
        input.startDate,
        input.endDate,
      ),
      events,
    });
  }

  items.sort((a, b) => a.productName.localeCompare(b.productName));
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    combined: input.combined,
    items,
    totals: summarizeInventoryTimeline(items),
  };
}
