import { describe, expect, it } from "vitest";

import {
  bookingAllowed,
  computeDispatchDateRange,
  getDeliveryTermNote,
  READY_STOCK_NOTE,
  SUBJECT_TO_AVAILABILITY_NOTE,
  validateDeliveryTerms,
} from "@/lib/delivery-terms";

describe("delivery terms", () => {
  it("allows booking only for advance and ready-stock modes", () => {
    expect(bookingAllowed("ADVANCE_BOOKING")).toBe(true);
    expect(bookingAllowed("READY_STOCK")).toBe(true);
    expect(bookingAllowed("SUBJECT_TO_AVAILABILITY")).toBe(false);
  });

  it("renders immutable note snapshot text for each mode", () => {
    expect(
      getDeliveryTermNote({
        mode: "ADVANCE_BOOKING",
        requiredPaymentPercent: 30,
        dispatchMinDays: 5,
        dispatchMaxDays: 8,
      }),
    ).toBe(
      "30% advance payment is required for booking. Delivery is expected within 5–8 days from booking confirmation.",
    );
    expect(getDeliveryTermNote({ mode: "READY_STOCK" })).toBe(
      READY_STOCK_NOTE,
    );
    expect(
      getDeliveryTermNote({ mode: "SUBJECT_TO_AVAILABILITY" }),
    ).toBe(SUBJECT_TO_AVAILABILITY_NOTE);
  });

  it("validates advance percentages and dispatch day ranges", () => {
    expect(
      validateDeliveryTerms({
        mode: "ADVANCE_BOOKING",
        requiredPaymentPercent: 25,
        dispatchMinDays: 5,
        dispatchMaxDays: 8,
      }),
    ).toEqual([]);

    const errors = validateDeliveryTerms({
      mode: "ADVANCE_BOOKING",
      requiredPaymentPercent: 101,
      dispatchMinDays: 9,
      dispatchMaxDays: 8,
    });
    expect(errors).toHaveLength(2);
    expect(errors.join(" ")).toContain("percentage");
    expect(errors.join(" ")).toContain("cannot exceed");
  });

  it("requires ready stock to use 100% when explicitly supplied", () => {
    expect(
      validateDeliveryTerms({
        mode: "READY_STOCK",
        requiredPaymentPercent: 50,
      }),
    ).toEqual(["Ready stock requires 100% payment."]);
    expect(
      validateDeliveryTerms({
        mode: "READY_STOCK",
        requiredPaymentPercent: 100,
      }),
    ).toEqual([]);
  });

  it("computes advance dispatch range and shifts each bound", () => {
    expect(
      computeDispatchDateRange(
        "2026-07-30",
        {
          mode: "ADVANCE_BOOKING",
          requiredPaymentPercent: 30,
          dispatchMinDays: 2,
          dispatchMaxDays: 4,
        },
        [1, 2, 3, 4, 5, 6],
        ["2026-08-01"],
      ),
    ).toEqual({
      earliestDispatchDate: "2026-08-03",
      latestDispatchDate: "2026-08-03",
    });
  });

  it("uses same-day ready stock and disables subject-to-availability dates", () => {
    expect(
      computeDispatchDateRange("2026-08-01", {
        mode: "READY_STOCK",
        requiredPaymentPercent: 100,
      }),
    ).toEqual({
      earliestDispatchDate: "2026-08-01",
      latestDispatchDate: "2026-08-01",
    });
    expect(
      computeDispatchDateRange("2026-08-01", {
        mode: "SUBJECT_TO_AVAILABILITY",
      }),
    ).toBeNull();
  });
});
