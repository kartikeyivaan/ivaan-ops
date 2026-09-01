import { describe, expect, it } from "vitest";
import {
  buildProjectDispatchSourceWarehouseIds,
  computeProRataReturnAllocations,
  isValidProjectDispatchSerialLocation,
  parseStockSourceLog,
  reduceStockSourceLog,
} from "@/lib/project-stock-service";

describe("parseStockSourceLog", () => {
  it("returns empty array for invalid input", () => {
    expect(parseStockSourceLog(null)).toEqual([]);
    expect(parseStockSourceLog({})).toEqual([]);
  });

  it("parses valid entries", () => {
    expect(
      parseStockSourceLog([
        { companyId: "ise", warehouseId: "ho", qty: 5 },
        { companyId: "pcm", warehouseId: "ho2", qty: 3 },
      ]),
    ).toEqual([
      { companyId: "ise", warehouseId: "ho", qty: 5 },
      { companyId: "pcm", warehouseId: "ho2", qty: 3 },
    ]);
  });
});

describe("computeProRataReturnAllocations", () => {
  it("splits return qty proportionally across sources", () => {
    const allocations = computeProRataReturnAllocations(10, [
      { companyId: "ise", warehouseId: "ise-ho", qty: 6 },
      { companyId: "pcm", warehouseId: "pcm-ho", qty: 4 },
    ]);

    expect(allocations).toHaveLength(2);
    expect(allocations.reduce((sum, row) => sum + row.qty, 0)).toBeCloseTo(10, 3);
    expect(allocations[0]?.companyId).toBe("ise");
    expect(allocations[1]?.companyId).toBe("pcm");
  });

  it("uses fallback when stock source log is empty", () => {
    const allocations = computeProRataReturnAllocations(5, [], {
      companyId: "ise",
      warehouseId: "ise-ho",
      qty: 5,
    });

    expect(allocations).toEqual([{ companyId: "ise", warehouseId: "ise-ho", qty: 5 }]);
  });
});

describe("reduceStockSourceLog", () => {
  it("reduces source entries proportionally", () => {
    const next = reduceStockSourceLog(
      [
        { companyId: "ise", warehouseId: "ise-ho", qty: 6 },
        { companyId: "pcm", warehouseId: "pcm-ho", qty: 4 },
      ],
      5,
    );

    expect(next.reduce((sum, row) => sum + row.qty, 0)).toBeCloseTo(5, 3);
  });

  it("clears log when fully released", () => {
    expect(
      reduceStockSourceLog([{ companyId: "ise", warehouseId: "ise-ho", qty: 3 }], 3),
    ).toEqual([]);
  });
});

describe("buildProjectDispatchSourceWarehouseIds", () => {
  it("lists Projects warehouse first and dedupes HO ids", () => {
    expect(
      buildProjectDispatchSourceWarehouseIds("projects-wh", ["ise-ho", "pcm-ho", "projects-wh"]),
    ).toEqual(["projects-wh", "ise-ho", "pcm-ho"]);
  });
});

describe("isValidProjectDispatchSerialLocation", () => {
  it("accepts Projects warehouse and HO pools only", () => {
    const hoIds = ["ise-ho", "pcm-ho"];
    expect(isValidProjectDispatchSerialLocation("projects-wh", "projects-wh", hoIds)).toBe(true);
    expect(isValidProjectDispatchSerialLocation("ise-ho", "projects-wh", hoIds)).toBe(true);
    expect(isValidProjectDispatchSerialLocation("other-wh", "projects-wh", hoIds)).toBe(false);
    expect(isValidProjectDispatchSerialLocation(null, "projects-wh", hoIds)).toBe(false);
  });
});
