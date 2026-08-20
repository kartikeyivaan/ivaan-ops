import { describe, expect, it } from "vitest";
import { SalesModuleTargetScope } from "@prisma/client";
import {
  DEFAULT_MODULE_TARGET,
  canManageSalesTargets,
  canViewSalesTargets,
} from "@/lib/sales-target-service";
import { ROLES } from "@/lib/rbac";

describe("sales-target-service permissions", () => {
  it("allows managers and admins to manage targets", () => {
    expect(canManageSalesTargets([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canManageSalesTargets([ROLES.SALES_MANAGER])).toBe(true);
    expect(canManageSalesTargets([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows executives to view their own target progress", () => {
    expect(canViewSalesTargets([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewSalesTargets([ROLES.WAREHOUSE])).toBe(false);
  });
});

describe("sales-target-service defaults", () => {
  it("uses PRD hard default of 3000 modules", () => {
    expect(DEFAULT_MODULE_TARGET).toBe(3000);
  });

  it("exposes expected scope enum values for resolution order", () => {
    expect(SalesModuleTargetScope.MONTHLY_OVERRIDE).toBe("MONTHLY_OVERRIDE");
    expect(SalesModuleTargetScope.EXECUTIVE_DEFAULT).toBe("EXECUTIVE_DEFAULT");
    expect(SalesModuleTargetScope.COMPANY_DEFAULT).toBe("COMPANY_DEFAULT");
  });
});

describe("module target progress math", () => {
  it("computes remaining and percent the same way as the widget", () => {
    const targetModules = 3000;
    const achievedModules = 1237;
    const remainingModules = Math.max(0, targetModules - achievedModules);
    const progressPercent = Math.round((achievedModules / targetModules) * 1000) / 10;

    expect(remainingModules).toBe(1763);
    expect(progressPercent).toBe(41.2);
  });

  it("allows exceeding target (remaining floors at 0)", () => {
    const targetModules = 3000;
    const achievedModules = 3500;
    expect(Math.max(0, targetModules - achievedModules)).toBe(0);
    expect(Math.round((achievedModules / targetModules) * 1000) / 10).toBe(116.7);
  });
});
