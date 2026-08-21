import { describe, expect, it } from "vitest";
import { PricingType } from "@prisma/client";
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

  it("sums UNIT dispatched value with GST", () => {
    const value = sumDispatchedValueFromLines([
      {
        lines: [
          {
            qty: 10,
            proformaInvoiceItem: { rate: 100, gstRate: 12 },
            product: { pricingType: PricingType.UNIT, capacity: 1 },
          },
          {
            qty: 2,
            proformaInvoiceItem: { rate: 50, gstRate: 18 },
            product: { pricingType: PricingType.UNIT, capacity: 1 },
          },
        ],
      },
    ]);
    // (10*100*1.12) + (2*50*1.18) = 1120 + 118
    expect(value).toBe(1238);
  });

  it("sums WP dispatched value with GST using qty * capacity * rate", () => {
    const value = sumDispatchedValueFromLines([
      {
        lines: [
          {
            qty: 100,
            proformaInvoiceItem: { rate: 22, gstRate: 12 },
            product: { pricingType: PricingType.WP, capacity: 590 },
          },
          {
            qty: 2,
            proformaInvoiceItem: { rate: 5000, gstRate: 12 },
            product: { pricingType: PricingType.UNIT, capacity: 10 },
          },
        ],
      },
    ]);
    // (100 * 590 * 22 + 2 * 5000) * 1.12 = 1,308,000 * 1.12
    expect(value).toBe(1464960);
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

  it("matches GST-inclusive dispatched value with line-level components", () => {
    const dispatches = [
      {
        lines: [
          {
            qty: 480,
            proformaInvoiceItem: { rate: 10, gstRate: 12 },
            product: { pricingType: PricingType.WP, capacity: 540 },
          },
          {
            qty: 1100,
            proformaInvoiceItem: { rate: 10, gstRate: 12 },
            product: { pricingType: PricingType.WP, capacity: 540 },
          },
        ],
      },
    ];
    const total = sumDispatchedValueFromLines(dispatches);
    // 480*540*10 + 1100*540*10 = 8,532,000; with 12% GST = 9,555,840
    expect(total).toBe(9555840);
  });
});
