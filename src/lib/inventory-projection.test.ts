import { describe, expect, it } from "vitest";

import {
  calculateInventoryProjection,
  findEarliestAvailabilityDate,
  getArrivalWindowDisplayData,
  getEarliestAvailabilityDate,
} from "@/lib/inventory-projection";
import type {
  InventoryEvent,
  InventoryEventType,
} from "@/lib/inventory-events";

function event(
  id: string,
  eventType: InventoryEventType,
  quantity: number,
  effectiveDate: string,
  overrides: Partial<InventoryEvent> = {},
): InventoryEvent {
  return {
    id,
    eventType,
    quantity,
    effectiveDate,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("inventory projection", () => {
  it("calculates deterministic daily sales availability", () => {
    const projection = calculateInventoryProjection({
      physicalStock: 200,
      safetyStock: 100,
      startDate: "2026-08-01",
      endDate: "2026-08-05",
      events: [
        event("reserve", "BOOKING_RESERVATION", 20, "2026-08-01"),
        event("incoming", "PURCHASE_INCOMING", 50, "2026-08-02", {
          expectedMinDate: "2026-08-02",
          expectedMaxDate: "2026-08-04",
        }),
        event("release", "BOOKING_RELEASE", 5, "2026-08-05"),
        event("cancelled", "RETURN_IN", 999, "2026-08-03", {
          status: "CANCELLED",
        }),
        event("draft", "RETURN_IN", 999, "2026-08-03", {
          status: "DRAFT",
        }),
      ],
    });

    expect(
      projection.map((day) => day.projectedAvailableQuantity),
    ).toEqual([80, 80, 80, 130, 135]);
    expect(projection[0]).toMatchObject({
      openingQuantity: 100,
      incomingQuantity: 0,
      outgoingQuantity: 20,
      netEventQuantity: -20,
    });
    expect(projection[3]).toMatchObject({
      openingQuantity: 80,
      incomingQuantity: 50,
      outgoingQuantity: 0,
    });
  });

  it("applies projection-affecting events before the requested range", () => {
    const projection = calculateInventoryProjection({
      physicalStock: 150,
      safetyStock: 100,
      startDate: "2026-08-03",
      endDate: "2026-08-03",
      events: [
        event("old-reservation", "BOOKING_RESERVATION", 15, "2026-08-01"),
      ],
    });

    expect(projection[0]?.openingQuantity).toBe(35);
    expect(projection[0]?.projectedAvailableQuantity).toBe(35);
  });

  it("does not double-deduct a planned dispatch replaced by actual dispatch", () => {
    const projection = calculateInventoryProjection({
      physicalStock: 150,
      safetyStock: 0,
      startDate: "2026-08-01",
      endDate: "2026-08-04",
      events: [
        event("planned", "PLANNED_DISPATCH", 10, "2026-08-03", {
          sourceType: "DISPATCH",
          sourceId: "dispatch-1",
        }),
        event("actual", "ACTUAL_DISPATCH", 10, "2026-08-04", {
          status: "COMPLETED",
          sourceType: "DISPATCH",
          sourceId: "dispatch-1",
        }),
      ],
    });

    expect(
      projection.map((day) => day.projectedAvailableQuantity),
    ).toEqual([150, 150, 150, 140]);
  });

  it("finds the earliest date with enough projected quantity", () => {
    const input = {
      physicalStock: 120,
      safetyStock: 100,
      startDate: "2026-08-01",
      endDate: "2026-08-05",
      events: [
        event("incoming", "PURCHASE_INCOMING", 50, "2026-08-02", {
          expectedMinDate: "2026-08-02",
          expectedMaxDate: "2026-08-04",
        }),
      ],
    };
    const projection = calculateInventoryProjection(input);

    expect(findEarliestAvailabilityDate(projection, 60)).toBe("2026-08-04");
    expect(getEarliestAvailabilityDate(input, 80)).toBeNull();
  });

  it("builds clipped display bars while retaining full arrival windows", () => {
    const bars = getArrivalWindowDisplayData(
      [
        event("incoming", "PURCHASE_INCOMING", 50, "2026-08-01", {
          expectedMinDate: "2026-08-01",
          expectedMaxDate: "2026-08-08",
          sourceNumber: "LOT-001",
        }),
        event("outside", "PURCHASE_INCOMING", 20, "2026-08-20", {
          expectedMinDate: "2026-08-20",
          expectedMaxDate: "2026-08-22",
        }),
      ],
      "2026-08-03",
      "2026-08-06",
    );

    expect(bars).toEqual([
      {
        eventId: "incoming",
        quantity: 50,
        expectedMinDate: "2026-08-01",
        expectedMaxDate: "2026-08-08",
        availableDate: "2026-08-08",
        visibleStartDate: "2026-08-03",
        visibleEndDate: "2026-08-06",
        sourceNumber: "LOT-001",
      },
    ]);
  });

  it("allows sales availability to go negative and validates inputs", () => {
    const projection = calculateInventoryProjection({
      physicalStock: 50,
      safetyStock: 100,
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      events: [],
    });
    expect(projection[0]?.projectedAvailableQuantity).toBe(-50);

    expect(() =>
      calculateInventoryProjection({
        physicalStock: -1,
        safetyStock: 0,
        startDate: "2026-08-01",
        endDate: "2026-08-01",
        events: [],
      }),
    ).toThrow(RangeError);
  });
});
