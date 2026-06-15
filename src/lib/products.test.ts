import { describe, expect, it } from "vitest";
import { CapacityUnit, PricingType } from "@prisma/client";
import {
  canEditProducts,
  canManageProductPricing,
  canViewProducts,
} from "@/lib/product-permissions";
import {
  generateDisplayName,
  resolvePricingType,
  resolveSerialTracking,
} from "@/lib/products";
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
  });

  it("enables serial tracking for modules and inverters", () => {
    expect(resolveSerialTracking("Modules")).toBe(true);
    expect(resolveSerialTracking("Inverters")).toBe(true);
    expect(resolveSerialTracking("Other")).toBe(false);
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
