import { describe, expect, it } from "vitest";
import { canManageVendors, canViewVendors } from "@/lib/vendor-permissions";
import { ROLES } from "@/lib/rbac";

describe("vendor permissions", () => {
  it("allows super admin and purchase to view vendors", () => {
    expect(canViewVendors([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canViewVendors([ROLES.PURCHASE])).toBe(true);
  });

  it("blocks other roles from viewing vendors", () => {
    expect(canViewVendors([ROLES.WAREHOUSE])).toBe(false);
    expect(canViewVendors([ROLES.SALES_MANAGER])).toBe(false);
  });

  it("allows super admin and purchase to manage vendors", () => {
    expect(canManageVendors([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canManageVendors([ROLES.PURCHASE])).toBe(true);
    expect(canManageVendors([ROLES.ACCOUNTS])).toBe(false);
  });
});
