import { describe, expect, it } from "vitest";

import {
  eventAffectsProjection,
  getInventoryEventEffect,
  getInventoryEventProjectionDate,
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

  it("rejects invalid unsigned quantities", () => {
    expect(() =>
      toSignedInventoryQuantity("RETURN_IN", -1),
    ).toThrow(RangeError);
    expect(() =>
      toSignedInventoryQuantity("RETURN_IN", Number.NaN),
    ).toThrow(RangeError);
  });
});
