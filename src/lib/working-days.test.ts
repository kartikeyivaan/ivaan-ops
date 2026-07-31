import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  getNextWorkingDate,
} from "@/lib/working-days";

describe("working days", () => {
  it("keeps a working date unchanged", () => {
    expect(getNextWorkingDate("2026-07-30")).toBe("2026-07-30");
  });

  it("treats Sunday as non-working by default", () => {
    expect(getNextWorkingDate("2026-08-02")).toBe("2026-08-03");
  });

  it("skips consecutive holidays and non-working days", () => {
    expect(
      getNextWorkingDate(
        "2026-08-01",
        [1, 2, 3, 4, 5, 6],
        ["2026-08-01", "2026-08-03"],
      ),
    ).toBe("2026-08-04");
  });

  it("supports a custom Monday-to-Friday calendar", () => {
    expect(getNextWorkingDate("2026-08-01", [1, 2, 3, 4, 5])).toBe(
      "2026-08-03",
    );
  });

  it("adds calendar days without local-time conversion", () => {
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("rejects invalid calendars and date-only strings", () => {
    expect(() => getNextWorkingDate("2026-02-30")).toThrow(RangeError);
    expect(() => getNextWorkingDate("2026-08-01", [])).toThrow(RangeError);
  });
});
