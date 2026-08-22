import { describe, expect, it } from "vitest";
import { ageingBucketToPiDateFilter } from "@/lib/reports";

describe("ageingBucketToPiDateFilter", () => {
  const asOf = new Date(Date.UTC(2026, 7, 22)); // 2026-08-22

  it("maps 0-30 to piDate >= asOf - 30 days", () => {
    expect(ageingBucketToPiDateFilter("0-30", asOf)).toEqual({
      gte: new Date(Date.UTC(2026, 6, 23)),
    });
  });

  it("maps 31-60 to a half-open window", () => {
    expect(ageingBucketToPiDateFilter("31-60", asOf)).toEqual({
      gte: new Date(Date.UTC(2026, 5, 23)),
      lt: new Date(Date.UTC(2026, 6, 23)),
    });
  });

  it("maps 90+ to piDate older than 90 days", () => {
    expect(ageingBucketToPiDateFilter("90+", asOf)).toEqual({
      lt: new Date(Date.UTC(2026, 4, 24)),
    });
  });

  it("returns undefined when bucket missing", () => {
    expect(ageingBucketToPiDateFilter(undefined, asOf)).toBeUndefined();
  });
});
