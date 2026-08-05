import { InventoryTransactionType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { signedPhysicalQty } from "@/lib/product-physical-ledger-service";

describe("signedPhysicalQty", () => {
  const warehouseId = "wh-a";

  it("counts inward as IN for destination warehouse", () => {
    expect(
      signedPhysicalQty(
        {
          transactionType: InventoryTransactionType.INWARD,
          qty: 10,
          fromWarehouseId: null,
          toWarehouseId: warehouseId,
        },
        { warehouseId },
      ),
    ).toEqual({ direction: "IN", signedQty: 10 });
  });

  it("counts dispatch as OUT for source warehouse", () => {
    expect(
      signedPhysicalQty(
        {
          transactionType: InventoryTransactionType.DISPATCH,
          qty: 3,
          fromWarehouseId: warehouseId,
          toWarehouseId: null,
        },
        { warehouseId },
      ),
    ).toEqual({ direction: "OUT", signedQty: -3 });
  });

  it("splits transfer in and out by warehouse", () => {
    expect(
      signedPhysicalQty(
        {
          transactionType: InventoryTransactionType.TRANSFER,
          qty: 5,
          fromWarehouseId: warehouseId,
          toWarehouseId: "wh-b",
        },
        { warehouseId },
      ),
    ).toEqual({ direction: "OUT", signedQty: -5 });

    expect(
      signedPhysicalQty(
        {
          transactionType: InventoryTransactionType.TRANSFER,
          qty: 5,
          fromWarehouseId: "wh-b",
          toWarehouseId: warehouseId,
        },
        { warehouseId },
      ),
    ).toEqual({ direction: "IN", signedQty: 5 });
  });

  it("classifies company-wide transfer receive vs dispatch via notes", () => {
    const companyWarehouseIds = new Set(["wh-a", "wh-b"]);
    expect(
      signedPhysicalQty(
        {
          transactionType: InventoryTransactionType.TRANSFER,
          qty: 2,
          fromWarehouseId: "wh-a",
          toWarehouseId: "wh-b",
          notes: "Dispatched TR-1",
        },
        { companyWarehouseIds },
      ),
    ).toEqual({ direction: "OUT", signedQty: -2 });

    expect(
      signedPhysicalQty(
        {
          transactionType: InventoryTransactionType.TRANSFER,
          qty: 2,
          fromWarehouseId: "wh-a",
          toWarehouseId: "wh-b",
          notes: "Received TR-1",
        },
        { companyWarehouseIds },
      ),
    ).toEqual({ direction: "IN", signedQty: 2 });
  });
});
