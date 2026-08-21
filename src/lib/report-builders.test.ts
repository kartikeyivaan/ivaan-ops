import { describe, expect, it } from "vitest";
import { PricingType } from "@prisma/client";
import {
  computePeriodComparison,
  sumDispatchedUnitsFromLines,
  sumDispatchedValueFromLines,
  sumDocumentValues,
  sumPaymentAmounts,
} from "@/lib/report-builders";
import { applyIncentiveCredit } from "@/lib/incentive-credit";

describe("report-builders", () => {
  it("sums document values with roundMoney", () => {
    expect(
      sumDocumentValues([
        { totalValue: 1000.556 },
        { totalValue: 2000.444 },
      ]),
    ).toEqual({ actual: 3001, counted: 3001 });
  });

  it("sums payment amounts", () => {
    expect(sumPaymentAmounts([{ amount: 500 }, { amount: 250.25 }])).toEqual({
      actual: 750.25,
      counted: 750.25,
    });
  });

  it("applies incentive credit percent to document values", () => {
    expect(
      sumDocumentValues([
        {
          totalValue: 1000,
          customer: { incentiveCreditPercent: 0 },
        },
        {
          totalValue: 1000,
          customer: { incentiveCreditPercent: 50 },
        },
      ]),
    ).toEqual({ actual: 2000, counted: 500 });
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
    expect(value).toEqual({ actual: 1238, counted: 1238 });
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
    expect(value).toEqual({ actual: 1464960, counted: 1464960 });
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
    expect(units).toEqual({
      modules: { actual: 100, counted: 100 },
      inverters: { actual: 5, counted: 5 },
      other: { actual: 3, counted: 3 },
    });
  });

  it("scales module units by incentive credit percent and keeps decimals", () => {
    const units = sumDispatchedUnitsFromLines([
      {
        customer: { incentiveCreditPercent: 50 },
        lines: [{ qty: 7, product: { category: { name: "Modules" } } }],
      },
      {
        customer: { incentiveCreditPercent: 0 },
        lines: [{ qty: 720, product: { category: { name: "Modules" } } }],
      },
    ]);
    expect(units.modules).toEqual({ actual: 727, counted: 3.5 });
  });

  it("computes period comparison percent on counted values", () => {
    expect(computePeriodComparison(120, 100)).toEqual({
      current: 120,
      previous: 100,
      changePercent: 20,
      actualCurrent: 120,
      actualPrevious: 100,
    });
    expect(computePeriodComparison(50, 0).changePercent).toBe(100);
    expect(
      computePeriodComparison(
        { actual: 200, counted: 100 },
        { actual: 100, counted: 50 },
      ),
    ).toEqual({
      current: 100,
      previous: 50,
      changePercent: 100,
      actualCurrent: 200,
      actualPrevious: 100,
    });
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
    expect(total).toEqual({ actual: 9555840, counted: 9555840 });
  });
});

describe("incentive-credit", () => {
  it("clamps and converts percent to factor", () => {
    expect(applyIncentiveCredit(100, 0)).toEqual({ actual: 100, counted: 0 });
    expect(applyIncentiveCredit(100, 50)).toEqual({ actual: 100, counted: 50 });
    expect(applyIncentiveCredit(100, 100)).toEqual({ actual: 100, counted: 100 });
  });
});
