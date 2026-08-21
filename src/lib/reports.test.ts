import { describe, expect, it } from "vitest";
import {
  calculateAgeingDays,
  calculateFreeQty,
  calculateOutstanding,
  getAgeingBucket,
  matchesAgeingBucket,
  sumMovementClosing,
} from "@/lib/reports";

describe("reports", () => {
  it("calculates free quantity including upcoming stock", () => {
    expect(calculateFreeQty(10, 3)).toBe(7);
    expect(calculateFreeQty(2, 5)).toBe(0);
    expect(calculateFreeQty(2, 5, 10)).toBe(7);
    expect(calculateFreeQty(10, 3, 5)).toBe(12);
  });

  it("calculates outstanding balance", () => {
    expect(calculateOutstanding(100000, 40000)).toBe(60000);
    expect(calculateOutstanding(50000, 70000)).toBe(0);
  });

  it("maps ageing buckets", () => {
    expect(getAgeingBucket(10)).toBe("0-30");
    expect(getAgeingBucket(45)).toBe("31-60");
    expect(getAgeingBucket(75)).toBe("61-90");
    expect(getAgeingBucket(120)).toBe("90+");
  });

  it("filters ageing buckets", () => {
    expect(matchesAgeingBucket(20, "0-30")).toBe(true);
    expect(matchesAgeingBucket(20, "31-60")).toBe(false);
    expect(matchesAgeingBucket(20)).toBe(true);
  });

  it("calculates ageing days from PI date", () => {
    const today = new Date("2026-06-16T12:00:00.000Z");
    const piDate = new Date("2026-06-01T00:00:00.000Z");
    expect(calculateAgeingDays(piDate, today)).toBeGreaterThanOrEqual(15);
  });

  it("calculates product movement closing balance", () => {
    expect(
      sumMovementClosing({
        opening: 10,
        incoming: 5,
        transfersIn: 2,
        booked: 3,
        damaged: 1,
        dispatched: 4,
        transfersOut: 2,
      }),
    ).toBe(7);
  });
});
