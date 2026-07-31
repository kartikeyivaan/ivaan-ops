import { describe, expect, it } from "vitest";

import { calculateInventoryProjection } from "@/lib/inventory-projection";
import type { InventoryEvent } from "@/lib/inventory-events";
import {
  computeTimelineReservedQuantity,
  enrichTimelineDayEvents,
  getInventoryTimelineDateRange,
  selectTimelineProjectionEvents,
  sumDispatchedQuantityForDay,
  summarizeInventoryTimeline,
  type DispatchTodayPiInfo,
} from "@/lib/inventory-timeline";

function reservation(
  id: string,
  quantity: number,
  expectedMinDate: string,
  sourceId: string,
  overrides: Partial<InventoryEvent> = {},
): InventoryEvent {
  return {
    id,
    eventType: "BOOKING_RESERVATION",
    status: "ACTIVE",
    quantity,
    effectiveDate: "2026-07-20",
    expectedMinDate,
    expectedMaxDate: expectedMinDate,
    sourceType: "PROFORMA_INVOICE",
    sourceId,
    sourceNumber: `PI-${sourceId}`,
    customerName: "Greenfield Projects Pvt Ltd",
    ...overrides,
  };
}

describe("inventory timeline helpers", () => {
  it("builds an inclusive fifteen-day calendar range", () => {
    expect(
      getInventoryTimelineDateRange(
        new Date("2026-07-30T04:00:00.000Z"),
      ),
    ).toEqual({
      startDate: "2026-07-30",
      endDate: "2026-08-13",
    });
  });

  it("sums quantity-only timeline metrics", () => {
    expect(
      summarizeInventoryTimeline([
        {
          physical: 100,
          reserved: 20,
          incoming: 40,
          safety: 10,
          netAvailableToday: 70,
        },
        {
          physical: 50,
          reserved: 5,
          incoming: 0,
          safety: 10,
          netAvailableToday: 35,
        },
      ]),
    ).toEqual({
      physical: 150,
      reserved: 25,
      incoming: 40,
      safety: 20,
      netAvailableToday: 105,
    });
  });
});

describe("dispatch today day breakdown", () => {
  const startDate = "2026-07-30";
  const dispatchTodayByPiId = new Map<string, DispatchTodayPiInfo>([
    [
      "pi-pending",
      {
        status: "Pending",
        fullQuantity: 36,
        customerName: "Greenfield Projects Pvt Ltd",
        piNo: "ISE-PI-26-27-00005",
      },
    ],
    [
      "pi-done",
      {
        status: "Dispatched",
        fullQuantity: 12,
        customerName: "Other Customer",
        piNo: "ISE-PI-26-27-00006",
      },
    ],
  ]);

  it("keeps pending dispatch-today out of reserved and in today’s outgoing", () => {
    const events = [
      reservation("r1", 36, startDate, "pi-pending"),
      reservation("r2", 10, "2026-08-10", "pi-future"),
    ];
    const superseded = new Set<string>();

    const reserved = computeTimelineReservedQuantity(
      events,
      superseded,
      startDate,
      dispatchTodayByPiId,
    );
    expect(reserved).toBe(0);

    const projectionEvents = selectTimelineProjectionEvents(
      events,
      superseded,
      startDate,
      dispatchTodayByPiId,
    );
    expect(projectionEvents.map((event) => event.id)).toEqual([
      "r1",
      "r2",
    ]);

    const physical = 72;
    const safety = 20;
    const projection = calculateInventoryProjection({
      physicalStock: Math.max(0, physical - reserved),
      safetyStock: safety,
      startDate,
      endDate: startDate,
      events: projectionEvents,
    });

    expect(projection[0]).toMatchObject({
      openingQuantity: 52,
      outgoingQuantity: 36,
      projectedAvailableQuantity: 16,
    });
  });

  it("still counts non-dispatch-today started bookings as reserved", () => {
    const events = [
      reservation("r1", 36, startDate, "pi-pending"),
      reservation("r-other", 10, startDate, "pi-other"),
    ];
    expect(
      computeTimelineReservedQuantity(
        events,
        new Set(),
        startDate,
        dispatchTodayByPiId,
      ),
    ).toBe(10);
  });

  it("does not treat dispatched dispatch-today as outgoing", () => {
    const events = [reservation("r-done", 12, startDate, "pi-done")];
    const superseded = new Set<string>();

    expect(
      computeTimelineReservedQuantity(
        events,
        superseded,
        startDate,
        dispatchTodayByPiId,
      ),
    ).toBe(0);
    expect(
      selectTimelineProjectionEvents(
        events,
        superseded,
        startDate,
        dispatchTodayByPiId,
      ),
    ).toEqual([]);
  });

  it("enriches pending events and lists dispatched ones on today", () => {
    const pending = reservation("r1", 36, startDate, "pi-pending");
    const done = reservation("r-done", 12, startDate, "pi-done");
    const enriched = enrichTimelineDayEvents(
      [pending],
      [pending, done],
      new Set(),
      startDate,
      startDate,
      dispatchTodayByPiId,
    );

    expect(enriched).toHaveLength(2);
    expect(enriched[0]).toMatchObject({
      id: "r1",
      dispatchTodayStatus: "Pending",
      displayQuantity: 36,
      sourceNumber: "ISE-PI-26-27-00005",
    });
    expect(enriched[1]).toMatchObject({
      id: "r-done",
      dispatchTodayStatus: "Dispatched",
      displayQuantity: 12,
      sourceNumber: "ISE-PI-26-27-00006",
    });
  });

  it("sums actual dispatch quantity for a day", () => {
    const events: InventoryEvent[] = [
      {
        id: "d1",
        eventType: "ACTUAL_DISPATCH",
        status: "COMPLETED",
        quantity: 5,
        effectiveDate: startDate,
        sourceType: "DISPATCH",
        sourceId: "dc-1",
        sourceNumber: "ISE-DC-26-27-00002",
      },
      {
        id: "d2",
        eventType: "ACTUAL_DISPATCH",
        status: "COMPLETED",
        quantity: 3,
        effectiveDate: "2026-08-01",
        sourceType: "DISPATCH",
        sourceId: "dc-2",
        sourceNumber: "ISE-DC-26-27-00003",
      },
    ];
    expect(sumDispatchedQuantityForDay(events, new Set(), startDate)).toBe(5);
    expect(sumDispatchedQuantityForDay(events, new Set(), "2026-08-01")).toBe(3);
  });
});
