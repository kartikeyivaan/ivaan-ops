import { describe, expect, it } from "vitest";
import {
  describePiRowProducts,
  formatPiLineQty,
  formatPiLineQtyUnit,
  getPiRowProductPresentation,
  sortPiRowProducts,
} from "@/lib/pi-row-products";

function item(
  id: string,
  displayName: string,
  qty: number,
  extras?: {
    dispatchedQty?: number;
    remainingQty?: number;
    lineTotal?: number;
    capacityUnit?: string;
  },
) {
  return {
    id,
    qty,
    dispatchedQty: extras?.dispatchedQty,
    remainingQty: extras?.remainingQty,
    lineTotal: extras?.lineTotal,
    product: { displayName, capacityUnit: extras?.capacityUnit },
  };
}

describe("pi row products", () => {
  it("formats integer and fractional quantities", () => {
    expect(formatPiLineQty(40)).toBe("40");
    expect(formatPiLineQty(250.5)).toBe("250.5");
  });

  it("maps meter products to Mtr and everything else to Nos", () => {
    expect(formatPiLineQtyUnit("METER")).toBe("Mtr");
    expect(formatPiLineQtyUnit("NOS")).toBe("Nos");
    expect(formatPiLineQtyUnit("WP")).toBe("Nos");
    expect(formatPiLineQtyUnit(undefined)).toBe("Nos");
  });

  it("sorts products by line value so the most important appear first", () => {
    const sorted = sortPiRowProducts([
      item("cable", "Polycab 6 Sqmm", 250, { lineTotal: 12000 }),
      item("module", "Waaree 590W DCR", 40, { lineTotal: 480000 }),
      item("connector", "MC4 Connector", 20, { lineTotal: 800 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["module", "cable", "connector"]);
  });

  it("stacks up to three products and collapses longer lists", () => {
    const three = getPiRowProductPresentation([
      item("a", "A", 1, { lineTotal: 3 }),
      item("b", "B", 1, { lineTotal: 2 }),
      item("c", "C", 1, { lineTotal: 1 }),
    ]);
    expect(three.mode).toBe("stacked");
    expect(three.visible).toHaveLength(3);
    expect(three.moreCount).toBe(0);

    const many = getPiRowProductPresentation([
      item("a", "A", 1, { lineTotal: 5 }),
      item("b", "B", 1, { lineTotal: 4 }),
      item("c", "C", 1, { lineTotal: 3 }),
      item("d", "D", 1, { lineTotal: 2 }),
      item("e", "E", 1, { lineTotal: 1 }),
    ]);
    expect(many.mode).toBe("inline");
    expect(many.visible.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(many.moreCount).toBe(3);
  });

  it("describes products for assistive text without relying on colour", () => {
    expect(
      describePiRowProducts([
        item("module", "Waaree 590W DCR", 40, {
          dispatchedQty: 20,
          remainingQty: 20,
          lineTotal: 100,
        }),
        item("cable", "Polycab 6 Sqmm", 250, {
          capacityUnit: "METER",
          dispatchedQty: 0,
          lineTotal: 10,
        }),
      ]),
    ).toBe(
      "Waaree 590W DCR, 40 Nos, 20 dispatched, 20 remaining; Polycab 6 Sqmm, 250 Mtr",
    );
  });
});
