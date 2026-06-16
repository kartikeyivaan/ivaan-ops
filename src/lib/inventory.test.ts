import { LotStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canModifyIncomingLot } from "@/lib/inventory-service";
import {
  canAdjustStock,
  canCreateIncoming,
  canInwardMaterial,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import {
  calculateTotalPurchaseCost,
  getFinancialYear,
  normalizeSerialNumber,
  validateInwardQuantities,
} from "@/lib/inventory";
import { ROLES } from "@/lib/rbac";

describe("inventory helpers", () => {
  it("computes financial year from date", () => {
    expect(getFinancialYear(new Date("2025-06-01"))).toBe("25-26");
    expect(getFinancialYear(new Date("2025-02-01"))).toBe("24-25");
  });

  it("normalizes serial numbers", () => {
    expect(normalizeSerialNumber(" sn-001 ")).toBe("SN-001");
  });

  it("calculates total purchase cost", () => {
    expect(
      calculateTotalPurchaseCost({
        quantity: 10,
        unitPurchaseRate: 100,
        gstRate: 12,
        transportCharges: 50,
        commissionCharges: 25,
      }),
    ).toBe(1195);
  });

  it("validates inward quantities", () => {
    expect(
      validateInwardQuantities({
        quantity: 100,
        receivedQuantity: 40,
        damagedQuantity: 0,
        receivedQty: 50,
        damagedQty: 5,
      }),
    ).toBeNull();

    expect(
      validateInwardQuantities({
        quantity: 100,
        receivedQuantity: 40,
        damagedQuantity: 0,
        receivedQty: 70,
        damagedQty: 0,
      }),
    ).toContain("exceed");
  });

  it("allows edit/delete only for pending incoming lots", () => {
    expect(
      canModifyIncomingLot({
        status: LotStatus.INCOMING,
        receivedQuantity: 0,
        damagedQuantity: 0,
      }),
    ).toBe(true);

    expect(
      canModifyIncomingLot({
        status: LotStatus.INCOMING,
        receivedQuantity: 1,
        damagedQuantity: 0,
      }),
    ).toBe(false);

    expect(
      canModifyIncomingLot({
        status: LotStatus.CLOSED,
        receivedQuantity: 0,
        damagedQuantity: 0,
      }),
    ).toBe(false);
  });
});

describe("inventory permissions", () => {
  it("allows sales to view inventory but not serials", () => {
    expect(canViewInventory([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewSerialNumbers([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows purchase to create incoming", () => {
    expect(canCreateIncoming([ROLES.PURCHASE])).toBe(true);
    expect(canInwardMaterial([ROLES.PURCHASE])).toBe(false);
  });

  it("allows warehouse to inward", () => {
    expect(canInwardMaterial([ROLES.WAREHOUSE])).toBe(true);
  });

  it("restricts stock adjustment to super admin", () => {
    expect(canAdjustStock([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canAdjustStock([ROLES.WAREHOUSE])).toBe(false);
  });
});
