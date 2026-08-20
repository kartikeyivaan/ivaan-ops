import { describe, expect, it } from "vitest";
import {
  getBusinessMonthRange,
  getBusinessToday,
  getPreviousPeriodRange,
  parseBusinessDate,
  resolveDashboardPeriod,
} from "@/lib/business-dates";

describe("business-dates", () => {
  it("formats business today in Asia/Kolkata", () => {
    const istMidnightUtc = new Date("2026-08-19T18:30:00.000Z");
    expect(getBusinessToday(istMidnightUtc)).toBe("2026-08-20");
  });

  it("returns month range from business today", () => {
    const range = getBusinessMonthRange(new Date("2026-08-15T12:00:00.000Z"));
    expect(range.fromDate).toBe("2026-08-01");
    expect(range.toDate).toMatch(/^2026-08-/);
    expect(range.month).toBe(8);
  });

  it("resolves dashboard month period", () => {
    const resolved = resolveDashboardPeriod("month", undefined, new Date("2026-08-20T10:00:00.000Z"));
    expect(resolved.fromDate).toBe("2026-08-01");
    expect(resolved.period).toBe("month");
  });

  it("computes previous period of equal length", () => {
    const prev = getPreviousPeriodRange("2026-08-01", "2026-08-31");
    expect(prev.toDate).toBe("2026-07-31");
    expect(prev.fromDate).toBe("2026-07-01");
  });

  it("parses business date to UTC midnight", () => {
    expect(parseBusinessDate("2026-08-20").toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});
