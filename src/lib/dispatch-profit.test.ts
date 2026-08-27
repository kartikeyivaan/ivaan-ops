import { describe, expect, it } from "vitest";
import {
  calculateDispatchLineProfitBundle,
  resolveLandingCost,
  resolveLineCogsExGst,
} from "@/lib/dispatch-profit";

describe("dispatch profit", () => {
  it("calculates margin from revenue and cogs", () => {
    const result = calculateDispatchLineProfitBundle(1000, 700);
    expect(result.revenueExGst).toBe(1000);
    expect(result.cogsExGst).toBe(700);
    expect(result.profitExGst).toBe(300);
    expect(result.marginPercent).toBe(30);
  });

  it("resolves landing cost effective on dispatch date", () => {
    const cost = resolveLandingCost(
      "product-1",
      new Date("2026-08-15T00:00:00.000Z"),
      [
        {
          productId: "product-1",
          landingCost: 42,
          effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
          effectiveTo: null,
        },
      ],
    );
    expect(cost).toBe(42);
  });

  it("uses serial lot cost when available", () => {
    const result = resolveLineCogsExGst(
      {
        productId: "product-1",
        qty: 2,
        serialTracking: true,
        serialLots: [
          { unitPurchaseRate: 100, totalPurchaseCost: 0, quantity: 1 },
          { unitPurchaseRate: 120, totalPurchaseCost: 0, quantity: 1 },
        ],
      },
      new Date("2026-08-15T00:00:00.000Z"),
      [],
    );
    expect(result.cogsExGst).toBe(220);
    expect(result.costSource).toBe("SERIAL_LOT");
  });
});
