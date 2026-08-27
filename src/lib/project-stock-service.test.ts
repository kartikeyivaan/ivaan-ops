import { describe, expect, it } from "vitest";
import {
  computeProRataReturnAllocations,
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
