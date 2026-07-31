import { describe, expect, it } from "vitest";
import { CapacityUnit, PricingType } from "@prisma/client";
import {
  canEditProducts,
  canManageProductPricing,
  canViewProducts,
} from "@/lib/product-permissions";
import {
  calculateKitSystemKwp,
  generateDisplayName,
  generateKitDisplayName,
  isKitCategory,
  resolvePricingType,
  resolveSerialTracking,
} from "@/lib/products";
import { resolveKitDispatchQty } from "@/lib/kit-fulfillment";
import { ROLES } from "@/lib/rbac";

describe("products helpers", () => {
  it("generates display name from product attributes", () => {
    expect(
      generateDisplayName({
        categoryName: "Modules",
        brandName: "Longi",
        technologyName: "TOPCon",
        capacity: 590,
        capacityUnit: CapacityUnit.WP,
      }),
    ).toBe("Modules - Longi - TOPCon - 590 Wp");
  });

  it("uses WP pricing for modules only", () => {
    expect(resolvePricingType("Modules")).toBe(PricingType.WP);
    expect(resolvePricingType("Inverters")).toBe(PricingType.UNIT);
    expect(resolvePricingType("Other")).toBe(PricingType.UNIT);
    expect(resolvePricingType("Kit")).toBe(PricingType.UNIT);
  });

  it("enables serial tracking for modules and inverters only", () => {
    expect(resolveSerialTracking("Modules")).toBe(true);
    expect(resolveSerialTracking("Inverters")).toBe(true);
    expect(resolveSerialTracking("Other")).toBe(false);
    expect(resolveSerialTracking("Kit")).toBe(false);
  });

  it("standardizes kit display names from BOM", () => {
    const lines = [
      {
        categoryName: "Modules",
        brandName: "Longi",
        capacity: 590,
        capacityUnit: CapacityUnit.WP,
        qty: 10,
      },
      {
        categoryName: "Inverters",
        brandName: "Growatt",
        capacity: 5,
        capacityUnit: CapacityUnit.KW,
        qty: 1,
      },
      {
        categoryName: "Other",
        brandName: "Polycab",
        capacity: 1,
        capacityUnit: CapacityUnit.METER,
        qty: 50,
      },
    ];
    expect(calculateKitSystemKwp(lines)).toBe(5.9);
    expect(generateKitDisplayName(lines)).toBe(
      "Kit - 5.9 kWp - Longi 590Wp ×10 - Growatt 5kW",
    );
    expect(isKitCategory("Kit")).toBe(true);
  });
});

describe("kit fulfillment", () => {
  it("resolves consistent kit dispatch quantities from BOM lines", () => {
    const kitQty = resolveKitDispatchQty({
      kitOrderedQty: 2,
      kitDispatchedQty: 0,
      bom: [
        {
          componentProductId: "module",
          qty: 10,
          displayName: "Module",
          serialTracking: true,
          categoryName: "Modules",
        },
        {
          componentProductId: "inverter",
          qty: 1,
          displayName: "Inverter",
          serialTracking: true,
          categoryName: "Inverters",
        },
      ],
      lines: [
        { productId: "module", qty: 10 },
        { productId: "inverter", qty: 1 },
      ],
    });
    expect(kitQty).toBe(1);
  });

  it("rejects mismatched kit component ratios", () => {
    expect(() =>
      resolveKitDispatchQty({
        kitOrderedQty: 2,
        kitDispatchedQty: 0,
        bom: [
          {
            componentProductId: "module",
            qty: 10,
            displayName: "Module",
            serialTracking: true,
            categoryName: "Modules",
          },
          {
            componentProductId: "inverter",
            qty: 1,
            displayName: "Inverter",
            serialTracking: true,
            categoryName: "Inverters",
          },
        ],
        lines: [
          { productId: "module", qty: 10 },
          { productId: "inverter", qty: 2 },
        ],
      }),
    ).toThrow("KIT_QTY_MISMATCH");
  });
});

describe("product permissions", () => {
  it("allows purchase and warehouse to edit products", () => {
    expect(canEditProducts([ROLES.PURCHASE])).toBe(true);
    expect(canEditProducts([ROLES.WAREHOUSE])).toBe(true);
    expect(canEditProducts([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows sales manager and purchase to manage pricing", () => {
    expect(canManageProductPricing([ROLES.SALES_MANAGER])).toBe(true);
    expect(canManageProductPricing([ROLES.PURCHASE])).toBe(true);
    expect(canManageProductPricing([ROLES.ACCOUNTS])).toBe(false);
  });

  it("allows all business roles to view products", () => {
    expect(canViewProducts([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewProducts([ROLES.SALES_EXECUTIVE])).toBe(true);
  });
});
