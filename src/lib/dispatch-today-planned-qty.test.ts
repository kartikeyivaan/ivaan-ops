import { describe, expect, it } from "vitest";
import {
  assertDispatchTodayPlannedQtyTotal,
  maxDispatchQtyForFormRow,
  resolveDispatchTodayPlannedQtyMap,
} from "@/lib/dispatch-today-planned-qty";

describe("dispatch-today-planned-qty", () => {
  const items = [
    {
      id: "item-a",
      productId: "prod-a",
      qty: 100,
      dispatchedQty: 0,
      dispatchTodayPlannedQty: null,
      product: { category: { name: "Modules" } },
    },
    {
      id: "item-b",
      productId: "prod-b",
      qty: 10,
      dispatchedQty: 4,
      dispatchTodayPlannedQty: null,
      product: { category: { name: "Inverters" } },
    },
  ];

  it("defaults missing lines to full remaining", () => {
    const map = resolveDispatchTodayPlannedQtyMap(items, [
      { proformaInvoiceItemId: "item-a", plannedQty: 20 },
    ]);
    expect(map.get("item-a")).toBe(20);
    expect(map.get("item-b")).toBe(6);
  });

  it("rejects planned qty above remaining", () => {
    expect(() =>
      resolveDispatchTodayPlannedQtyMap(items, [
        { proformaInvoiceItemId: "item-b", plannedQty: 7 },
      ]),
    ).toThrow("INVALID_PLANNED_QTY");
  });

  it("requires at least one positive qty on initial mark", () => {
    const map = resolveDispatchTodayPlannedQtyMap(items, [
      { proformaInvoiceItemId: "item-a", plannedQty: 0 },
      { proformaInvoiceItemId: "item-b", plannedQty: 0 },
    ]);
    expect(() =>
      assertDispatchTodayPlannedQtyTotal(map, { requirePositiveTotal: true }),
    ).toThrow("DISPATCH_TODAY_QTY_REQUIRED");
  });

  it("caps warehouse kit component qty from planned kit units", () => {
    expect(
      maxDispatchQtyForFormRow({
        remainingQty: 50,
        kitBomQty: 5,
        piItemPlannedKitQty: 4,
        usesPlannedCap: true,
      }),
    ).toBe(20);
  });
});
