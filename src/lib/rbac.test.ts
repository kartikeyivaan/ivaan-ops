import { describe, expect, it } from "vitest";
import { ALL_ROLES, canAccessNav, hasRole, isSuperAdmin, NAV_ITEMS, ROLES } from "@/lib/rbac";

describe("rbac", () => {
  it("identifies super admin", () => {
    expect(isSuperAdmin([ROLES.SUPER_ADMIN])).toBe(true);
    expect(isSuperAdmin([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("checks role membership", () => {
    expect(hasRole([ROLES.WAREHOUSE], [ROLES.WAREHOUSE, ROLES.PURCHASE])).toBe(true);
    expect(hasRole([ROLES.ACCOUNTS], [ROLES.WAREHOUSE])).toBe(false);
  });

  it("exposes all configured roles", () => {
    expect(ALL_ROLES).toHaveLength(10);
    expect(ALL_ROLES).toContain(ROLES.PROJECTS_MANAGER);
    expect(ALL_ROLES).toContain(ROLES.PROJECTS_SALES_EXECUTIVE);
    expect(ALL_ROLES).toContain(ROLES.SERVICE_EXECUTIVE);
    expect(ALL_ROLES).toContain(ROLES.DOCUMENTATION_EXECUTIVE);
  });

  it("restricts admin navigation to super admin", () => {
    const usersNav = NAV_ITEMS.find((item) => item.href === "/admin/users");
    expect(usersNav).toBeDefined();
    expect(canAccessNav([ROLES.SUPER_ADMIN], usersNav!)).toBe(true);
    expect(canAccessNav([ROLES.SALES_EXECUTIVE], usersNav!)).toBe(false);
  });

  it("allows documentation executive to access QR History", () => {
    const qrHistoryNav = NAV_ITEMS.find((item) => item.href === "/inventory/qr-history");
    expect(qrHistoryNav).toBeDefined();
    expect(canAccessNav([ROLES.DOCUMENTATION_EXECUTIVE], qrHistoryNav!)).toBe(true);
    expect(canAccessNav([ROLES.SALES_EXECUTIVE], qrHistoryNav!)).toBe(false);
  });
});
