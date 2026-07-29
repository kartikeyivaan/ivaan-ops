import {
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
  getInventoryEventProjectionDate,
  type InventoryEvent,
} from "@/lib/inventory-events";
import { prisma } from "@/lib/prisma";
import { resolveSafetyQty } from "@/lib/safety-stock";
import { addCalendarDays } from "@/lib/working-days";

export const INVENTORY_TIMELINE_DAYS = 15;

export type InventoryTimelineDay = {
  date: string;
  opening: number;
  incoming: number;
  outgoing: number;
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
  reserved: number;
  incoming: number;
  safety: number;
  events: InventoryEvent[];
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function scopeKey(companyId: string, warehouseId: string, productId: string) {
  return `${companyId}:${warehouseId}:${productId}`;
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
        reserved: 0,
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
      scope.incoming += Math.max(0, quantity - received - damaged);
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
      scope.physical += group._count._all;
    }
    if (group.status === SerialStatus.BOOKED) {
      scope.reserved += group._count._all;
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
      replacesEventId: row.replacesEventId,
    };
    const scope = getScope(row.companyId, row.warehouseId, row.productId);
    scope.events.push(event);

    const product = productById.get(row.productId);
    if (
      product &&
      !product.serialTracking &&
      event.effectiveDate <= input.startDate
    ) {
      if (event.eventType === "BOOKING_RESERVATION") {
        scope.reserved += event.quantity;
      } else if (event.eventType === "BOOKING_RELEASE") {
        scope.reserved = Math.max(0, scope.reserved - event.quantity);
      }
    }
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
    const physical = scopes.reduce((sum, scope) => sum + scope.physical, 0);
    const reserved = scopes.reduce((sum, scope) => sum + scope.reserved, 0);
    const incoming = scopes.reduce((sum, scope) => sum + scope.incoming, 0);
    const safety = scopes.reduce((sum, scope) => sum + scope.safety, 0);
    const futureEvents = events.filter((event) => {
      const projectionDate = getInventoryEventProjectionDate(event);
      if (projectionDate > input.startDate) return true;
      if (projectionDate < input.startDate) return false;

      // Reservations through today are already represented by the reserved
      // baseline; completed dispatches are already reflected in physical stock.
      return (
        event.eventType !== "BOOKING_RESERVATION" &&
        event.eventType !== "BOOKING_RELEASE" &&
        event.eventType !== "ACTUAL_DISPATCH"
      );
    });
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
        closing: day.projectedAvailableQuantity,
        events: day.events,
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
