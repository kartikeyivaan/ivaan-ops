import { describe, expect, it } from "vitest";

import { calculateInventoryProjection } from "@/lib/inventory-projection";
import type { InventoryEvent } from "@/lib/inventory-events";
import {
  buildInventoryTimelineDayBreakdown,
  computeTimelineReservedQuantity,
  enrichTimelineDayEvents,
  getInventoryTimelineDateRange,
  selectTimelineProjectionEvents,
  sumActualDispatchInDayEvents,
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

describe("inventory timeline day breakdown pairs", () => {
  const startDate = "2026-07-30";

  it("moves received out of opening on the physical baseline day", () => {
    // Physical already includes 72 received; incoming event already reduced.
    const day = buildInventoryTimelineDayBreakdown({
      projectionOpening: 182,
      incoming: 648,
      projectionOutgoing: 36,
      actualDispatchInOutgoing: 0,
      received: 72,
      dispatched: 0,
      physicalBaseline: true,
    });

    expect(day).toEqual({
      opening: 110,
      incoming: 648,
      received: 72,
      outgoing: 36,
      dispatched: 0,
      closing: 794,
    });
    expect(
      day.opening + day.incoming + day.received - day.outgoing - day.dispatched,
    ).toBe(day.closing);
  });

  it("moves dispatched out of opening on the physical baseline day", () => {
    const day = buildInventoryTimelineDayBreakdown({
      projectionOpening: 182,
      incoming: 0,
      projectionOutgoing: 36,
      actualDispatchInOutgoing: 0,
      received: 0,
      dispatched: 324,
      physicalBaseline: true,
    });

    expect(day).toEqual({
      opening: 506,
      incoming: 0,
      received: 0,
      outgoing: 36,
      dispatched: 324,
      closing: 146,
    });
    expect(
      day.opening + day.incoming + day.received - day.outgoing - day.dispatched,
    ).toBe(day.closing);
  });

  it("keeps closing equal to sales-available when pairs transfer", () => {
    // Receiving 50 reduces incoming by 50 and raises received by 50 — net 0.
    const before = buildInventoryTimelineDayBreakdown({
      projectionOpening: 100,
      incoming: 80,
      projectionOutgoing: 20,
      actualDispatchInOutgoing: 0,
      received: 0,
      dispatched: 0,
      physicalBaseline: true,
    });
    const after = buildInventoryTimelineDayBreakdown({
      projectionOpening: 150, // physical gained the 50 received
      incoming: 30,
      projectionOutgoing: 20,
      actualDispatchInOutgoing: 0,
      received: 50,
      dispatched: 0,
      physicalBaseline: true,
    });
    expect(before.closing).toBe(160);
    expect(after.closing).toBe(160);
  });

  it("strips actual dispatch from outgoing so it only counts under Dispatched", () => {
    const day = buildInventoryTimelineDayBreakdown({
      projectionOpening: 200,
      incoming: 0,
      projectionOutgoing: 40,
      actualDispatchInOutgoing: 15,
      received: 0,
      dispatched: 15,
      physicalBaseline: false,
    });

    expect(day.outgoing).toBe(25);
    expect(day.dispatched).toBe(15);
    expect(day.closing).toBe(160);
  });

  it("sums actual dispatch quantities inside day events", () => {
    expect(
      sumActualDispatchInDayEvents([
        reservation("r1", 10, startDate, "pi-1"),
        {
          id: "d1",
          eventType: "ACTUAL_DISPATCH",
          status: "COMPLETED",
          quantity: 7,
          effectiveDate: startDate,
          sourceType: "DISPATCH",
          sourceId: "dc-1",
        },
      ]),
    ).toBe(7);
  });
});
