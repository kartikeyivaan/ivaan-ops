import { describe, expect, it } from "vitest";

import {
  applyPendingIncomingToPurchaseEvents,
  applyRemainingPiQtyToBookingReservations,
  eventAffectsProjection,
  filterEventsForLivePhysicalProjection,
  getInventoryEventEffect,
  getInventoryEventProjectionDate,
  getSupersededInventoryEventIds,
  inventoryEventSignedQuantity,
  toSignedInventoryQuantity,
  type InventoryEvent,
} from "@/lib/inventory-events";

describe("inventory events", () => {
  it("maps every stock-in event to a positive effect", () => {
    for (const type of [
      "OPENING_STOCK",
      "MANUAL_ADJUSTMENT_IN",
      "PURCHASE_INCOMING",
      "STOCK_TRANSFER_IN",
      "BOOKING_RELEASE",
      "RETURN_IN",
    ] as const) {
      expect(getInventoryEventEffect(type)).toBe("INCREASE");
      expect(toSignedInventoryQuantity(type, 12)).toBe(12);
    }
  });

  it("maps every stock-out event to a negative effect", () => {
    for (const type of [
      "MANUAL_ADJUSTMENT_OUT",
      "STOCK_TRANSFER_OUT",
      "BOOKING_RESERVATION",
      "PLANNED_DISPATCH",
      "ACTUAL_DISPATCH",
      "RETURN_OUT",
    ] as const) {
      expect(getInventoryEventEffect(type)).toBe("DECREASE");
      expect(toSignedInventoryQuantity(type, 12)).toBe(-12);
    }
  });

  it("only includes active and completed events", () => {
    expect(eventAffectsProjection("DRAFT")).toBe(false);
    expect(eventAffectsProjection("CANCELLED")).toBe(false);
    expect(eventAffectsProjection("ACTIVE")).toBe(true);
    expect(eventAffectsProjection("COMPLETED")).toBe(true);

    expect(
      inventoryEventSignedQuantity({
        eventType: "PURCHASE_INCOMING",
        quantity: 10,
        status: "CANCELLED",
      }),
    ).toBe(0);
  });

  it("uses the conservative maximum arrival date for incoming stock", () => {
    const incoming: InventoryEvent = {
      id: "incoming-1",
      eventType: "PURCHASE_INCOMING",
      status: "ACTIVE",
      quantity: 50,
      effectiveDate: "2026-08-05",
      expectedMinDate: "2026-08-05",
      expectedMaxDate: "2026-08-08",
    };

    expect(getInventoryEventProjectionDate(incoming)).toBe("2026-08-08");
    expect(
      getInventoryEventProjectionDate({
        ...incoming,
        eventType: "RETURN_IN",
      }),
    ).toBe("2026-08-05");
  });

  it("uses the committed dispatch start for booking reservations", () => {
    expect(
      getInventoryEventProjectionDate({
        eventType: "BOOKING_RESERVATION",
        effectiveDate: "2026-07-30",
        expectedMinDate: "2026-08-04",
        expectedMaxDate: "2026-08-07",
      }),
    ).toBe("2026-08-04");

    expect(
      getInventoryEventProjectionDate({
        eventType: "BOOKING_RESERVATION",
        effectiveDate: "2026-07-30",
      }),
    ).toBe("2026-07-30");
  });

  it("supersedes booking reservations when a release exists", () => {
    const superseded = getSupersededInventoryEventIds([
      {
        id: "reserve-1",
        eventType: "BOOKING_RESERVATION",
        status: "ACTIVE",
        quantity: 10,
        effectiveDate: "2026-07-30",
        expectedMinDate: "2026-08-04",
      },
      {
        id: "release-1",
        eventType: "BOOKING_RELEASE",
        status: "ACTIVE",
        quantity: 10,
        effectiveDate: "2026-08-01",
        replacesEventId: "reserve-1",
      },
    ]);

    expect(superseded.has("reserve-1")).toBe(true);
    expect(superseded.has("release-1")).toBe(true);
  });

  it("filters live-physical projection to avoid double-counting dispatches", () => {
    const events: InventoryEvent[] = [
      {
        id: "reserve-dispatched",
        eventType: "BOOKING_RESERVATION",
        status: "ACTIVE",
        quantity: 54,
        effectiveDate: "2026-08-04",
        expectedMinDate: "2026-08-05",
        sourceType: "PROFORMA_INVOICE",
        sourceId: "pi-1",
      },
      {
        id: "reserve-open",
        eventType: "BOOKING_RESERVATION",
        status: "ACTIVE",
        quantity: 36,
        effectiveDate: "2026-08-04",
        expectedMinDate: "2026-08-05",
        sourceType: "PROFORMA_INVOICE",
        sourceId: "pi-2",
      },
      {
        id: "actual-1",
        eventType: "ACTUAL_DISPATCH",
        status: "COMPLETED",
        quantity: 54,
        effectiveDate: "2026-08-05",
        sourceType: "DISPATCH",
        sourceId: "dc-1",
      },
      {
        id: "planned-1",
        eventType: "PLANNED_DISPATCH",
        status: "ACTIVE",
        quantity: 54,
        effectiveDate: "2026-08-05",
        sourceType: "DISPATCH",
        sourceId: "dc-1",
      },
    ];

    const filtered = filterEventsForLivePhysicalProjection(
      events,
      new Map([["pi-1", 54]]),
    );

    expect(filtered.map((event) => event.id)).toEqual(["reserve-open"]);
  });

  it("drops fulfilled PI reservations and reduces partial remaining qty", () => {
    const events: InventoryEvent[] = [
      {
        id: "reserve-done",
        eventType: "BOOKING_RESERVATION",
        status: "ACTIVE",
        quantity: 36,
        effectiveDate: "2026-08-07",
        expectedMinDate: "2026-08-07",
        sourceType: "PROFORMA_INVOICE",
        sourceId: "pi-done",
      },
      {
        id: "reserve-partial",
        eventType: "BOOKING_RESERVATION",
        status: "ACTIVE",
        quantity: 40,
        effectiveDate: "2026-08-07",
        expectedMinDate: "2026-08-07",
        sourceType: "PROFORMA_INVOICE",
        sourceId: "pi-partial",
      },
      {
        id: "reserve-open",
        eventType: "BOOKING_RESERVATION",
        status: "ACTIVE",
        quantity: 5,
        effectiveDate: "2026-08-07",
        expectedMinDate: "2026-08-07",
        sourceType: "PROFORMA_INVOICE",
        sourceId: "pi-open",
      },
      {
        id: "incoming-1",
        eventType: "PURCHASE_INCOMING",
        status: "ACTIVE",
        quantity: 10,
        effectiveDate: "2026-08-08",
      },
    ];

    expect(
      applyRemainingPiQtyToBookingReservations(
        events,
        new Map([
          ["pi-done", 0],
          ["pi-partial", 10],
          ["pi-open", 5],
        ]),
      ),
    ).toEqual([
      expect.objectContaining({ id: "reserve-partial", quantity: 10 }),
      expect.objectContaining({ id: "reserve-open", quantity: 5 }),
      expect.objectContaining({ id: "incoming-1", quantity: 10 }),
    ]);
  });

  it("reduces purchase incoming events to the lot's pending quantity", () => {
    const events: InventoryEvent[] = [
      {
        id: "incoming-1",
        eventType: "PURCHASE_INCOMING",
        status: "ACTIVE",
        quantity: 720,
        effectiveDate: "2026-08-03",
        expectedMinDate: "2026-08-03",
        expectedMaxDate: "2026-08-03",
        sourceType: "INVENTORY_LOT",
        sourceId: "lot-1",
        sourceNumber: "LOT-26-27-00006",
      },
      {
        id: "other",
        eventType: "BOOKING_RESERVATION",
        status: "ACTIVE",
        quantity: 10,
        effectiveDate: "2026-08-01",
      },
    ];

    expect(
      applyPendingIncomingToPurchaseEvents(
        events,
        new Map([
          [
            "lot-1",
            { quantity: 720, receivedQuantity: 72, damagedQuantity: 0 },
          ],
        ]),
      ),
    ).toEqual([
      expect.objectContaining({ id: "incoming-1", quantity: 648 }),
      expect.objectContaining({ id: "other", quantity: 10 }),
    ]);
  });

  it("rejects invalid unsigned quantities", () => {
    expect(() =>
      toSignedInventoryQuantity("RETURN_IN", -1),
    ).toThrow(RangeError);
    expect(() =>
      toSignedInventoryQuantity("RETURN_IN", Number.NaN),
    ).toThrow(RangeError);
  });
});
