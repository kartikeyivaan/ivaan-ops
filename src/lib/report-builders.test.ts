import { describe, expect, it } from "vitest";
import {
  computePeriodComparison,
  sumDispatchedUnitsFromLines,
  sumDispatchedValueFromLines,
  sumDocumentValues,
  sumPaymentAmounts,
} from "@/lib/report-builders";

describe("report-builders", () => {
  it("sums document values with roundMoney", () => {
    expect(
      sumDocumentValues([
        { totalValue: 1000.556 },
        { totalValue: 2000.444 },
      ]),
    ).toBe(3001);
  });

  it("sums payment amounts", () => {
    expect(sumPaymentAmounts([{ amount: 500 }, { amount: 250.25 }])).toBe(750.25);
  });

  it("sums dispatched value using executive aggregation policy", () => {
    const value = sumDispatchedValueFromLines([
      {
        lines: [
          { qty: 10, proformaInvoiceItem: { rate: 100.555 } },
          { qty: 2, proformaInvoiceItem: { rate: 50.444 } },
        ],
      },
    ]);
    expect(value).toBe(1106.44);
  });

  it("classifies dispatched units by product category", () => {
    const units = sumDispatchedUnitsFromLines([
      {
        lines: [
          {
            qty: 100,
            product: { category: { name: "Modules" } },
          },
          {
            qty: 5,
            product: { category: { name: "Inverters" } },
          },
          {
            qty: 3,
            product: { category: { name: "Other" } },
          },
          {
            qty: 10,
            product: { category: { name: "Kit" } },
          },
        ],
      },
    ]);
    expect(units).toEqual({ modules: 100, inverters: 5, other: 3 });
  });

  it("computes period comparison percent", () => {
    expect(computePeriodComparison(120, 100)).toEqual({
      current: 120,
      previous: 100,
      changePercent: 20,
    });
    expect(computePeriodComparison(50, 0).changePercent).toBe(100);
  });

  it("matches dispatched value formula with line-level components", () => {
    const dispatches = [
      {
        lines: [
          { qty: 480, proformaInvoiceItem: { rate: 10 } },
          { qty: 1100, proformaInvoiceItem: { rate: 10 } },
        ],
      },
    ];
    const total = sumDispatchedValueFromLines(dispatches);
    const lineRoundedSum = dispatches[0]!.lines.reduce(
      (sum, line) => sum + Math.round(line.qty * line.proformaInvoiceItem.rate * 100) / 100,
      0,
    );
    expect(total).toBe(15800);
    expect(total).toBe(lineRoundedSum);
  });
});
