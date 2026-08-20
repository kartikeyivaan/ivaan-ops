import { LotStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canEditIncomingLot, canModifyIncomingLot } from "@/lib/inventory-service";
import {
  canAdjustStock,
  canApplyIncomingLotReceiveEdit,
  canApproveIncomingLotEdit,
  canCreateIncoming,
  canEditClosedIncomingLot,
  canInwardMaterial,
  canProposeIncomingLotReceiveEdit,
  canViewInventory,
  canViewQrHistory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import {
  calculateTotalPurchaseCost,
  classifyInwardSerials,
  findDuplicateSerialKeys,
  getFinancialYear,
  isValidInwardSerialFormat,
  isWaareeBrand,
  isWaareePanelSerial,
  normalizePurchaseInvoiceNo,
  normalizeSerialNumber,
  parseSerialInput,
  pendingIncomingQuantity,
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

  it("parses serial paste and ignores [QR] noise", () => {
    expect(
      parseSerialInput("WS07269074147109, [QR] WS07269074147157\nWS07269074147111"),
    ).toEqual(["WS07269074147109", "WS07269074147157", "WS07269074147111"]);
    expect(parseSerialInput("[QR]")).toEqual([]);
  });

  it("detects Waaree panel serial format and brand", () => {
    expect(isWaareePanelSerial("WS07269074147109")).toBe(true);
    expect(isWaareePanelSerial("ws07269074147109")).toBe(true);
    expect(isWaareePanelSerial("WS0726907414710")).toBe(false);
    expect(isWaareePanelSerial("LN07269074147109")).toBe(false);
    expect(isWaareeBrand("Waaree")).toBe(true);
    expect(isWaareeBrand("Longi")).toBe(false);
  });

  it("finds duplicate serial keys", () => {
    expect(
      findDuplicateSerialKeys([
        "WS07269074147109",
        "ws07269074147157",
        "WS07269074147109",
      ]),
    ).toEqual(new Set(["WS07269074147109"]));
  });

  it("validates inward serial format by brand", () => {
    expect(isValidInwardSerialFormat("WS07269074147109", "Waaree")).toBe(true);
    expect(isValidInwardSerialFormat("LN07269074147109", "Waaree")).toBe(false);
    expect(isValidInwardSerialFormat("LN-001", "Longi")).toBe(true);
  });

  it("skips serial format constraints for inverters", () => {
    expect(
      isValidInwardSerialFormat("WPS033260710898", "Waaree", "Inverters"),
    ).toBe(true);
    expect(isValidInwardSerialFormat("BAD", "Waaree", "Inverters")).toBe(true);
    expect(
      isValidInwardSerialFormat("WPS033260710898", "Waaree", "Modules"),
    ).toBe(false);
  });

  it("classifies inward serials into new, repeat, and invalid", () => {
    expect(
      classifyInwardSerials({
        serials: [
          "WS07269074147109",
          "ws07269074147109",
          "BAD",
          "WS07269074147157",
          "WS07269074147111",
        ],
        existingKeys: ["WS07269074147157"],
        brandName: "Waaree",
        categoryName: "Modules",
      }),
    ).toEqual({
      newSerials: ["WS07269074147109", "WS07269074147111"],
      repeatSerials: ["WS07269074147109", "WS07269074147157"],
      invalidSerials: ["BAD"],
    });
  });

  it("classifies Waaree inverter serials without format rejection", () => {
    expect(
      classifyInwardSerials({
        serials: ["WPS033260710898", "WPS033260710903", "WPS033260710898"],
        brandName: "Waaree",
        categoryName: "Inverters",
      }),
    ).toEqual({
      newSerials: ["WPS033260710898", "WPS033260710903"],
      repeatSerials: ["WPS033260710898"],
      invalidSerials: [],
    });
  });

  it("calculates pending incoming after partial receipt", () => {
    expect(
      pendingIncomingQuantity({
        quantity: 720,
        receivedQuantity: 72,
        damagedQuantity: 0,
      }),
    ).toBe(648);
    expect(
      pendingIncomingQuantity({
        quantity: 720,
        receivedQuantity: 720,
        damagedQuantity: 0,
      }),
    ).toBe(0);
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

  it("normalizes purchase invoice numbers", () => {
    expect(normalizePurchaseInvoiceNo(" inv-001 ")).toBe("INV-001");
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

  it("allows edit for any INCOMING lot, delete only when no receipts", () => {
    expect(
      canEditIncomingLot({
        status: LotStatus.INCOMING,
      }),
    ).toBe(true);

    expect(
      canEditIncomingLot({
        status: LotStatus.CLOSED,
      }),
    ).toBe(false);

    expect(
      canEditIncomingLot(
        {
          status: LotStatus.CLOSED,
        },
        { allowClosed: true },
      ),
    ).toBe(true);

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

  it("allows documentation executive to check QR history but not other serial views", () => {
    expect(canViewQrHistory([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(true);
    expect(canViewInventory([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(false);
    expect(canViewSerialNumbers([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(false);
  });

  it("allows purchase to create incoming", () => {
    expect(canCreateIncoming([ROLES.PURCHASE])).toBe(true);
    expect(canInwardMaterial([ROLES.PURCHASE])).toBe(false);
  });

  it("allows warehouse to inward", () => {
    expect(canInwardMaterial([ROLES.WAREHOUSE])).toBe(true);
  });

  it("allows warehouse to propose receive edits and purchase to approve", () => {
    expect(canProposeIncomingLotReceiveEdit([ROLES.WAREHOUSE])).toBe(true);
    expect(canApplyIncomingLotReceiveEdit([ROLES.WAREHOUSE])).toBe(false);
    expect(canApproveIncomingLotEdit([ROLES.WAREHOUSE])).toBe(false);

    expect(canProposeIncomingLotReceiveEdit([ROLES.PURCHASE])).toBe(false);
    expect(canApplyIncomingLotReceiveEdit([ROLES.PURCHASE])).toBe(true);
    expect(canApproveIncomingLotEdit([ROLES.PURCHASE])).toBe(true);

    expect(canApplyIncomingLotReceiveEdit([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canApproveIncomingLotEdit([ROLES.SUPER_ADMIN])).toBe(true);
  });

  it("restricts stock adjustment to super admin", () => {
    expect(canAdjustStock([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canAdjustStock([ROLES.WAREHOUSE])).toBe(false);
  });

  it("allows only super admin to edit closed history lots", () => {
    expect(canEditClosedIncomingLot([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canEditClosedIncomingLot([ROLES.PURCHASE])).toBe(false);
    expect(canEditClosedIncomingLot([ROLES.WAREHOUSE])).toBe(false);
  });
});
