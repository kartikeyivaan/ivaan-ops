import { describe, expect, it } from "vitest";
import {
  canViewExecutivePerformanceDetail,
  canViewSalesDashboard,
  canViewTeamSalesDashboard,
  resolveRestrictToUserId,
} from "@/lib/sales-dashboard/dashboard-permissions";
import { ROLES } from "@/lib/rbac";

describe("dashboard-permissions", () => {
  it("allows sales roles on the sales dashboard", () => {
    expect(canViewSalesDashboard([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewSalesDashboard([ROLES.SALES_MANAGER])).toBe(true);
    expect(canViewSalesDashboard([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canViewSalesDashboard([ROLES.WAREHOUSE])).toBe(false);
  });

  it("limits team dashboard to managers and super admins", () => {
    expect(canViewTeamSalesDashboard([ROLES.SALES_MANAGER])).toBe(true);
    expect(canViewTeamSalesDashboard([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canViewTeamSalesDashboard([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows executives to view only their own performance detail", () => {
    expect(
      canViewExecutivePerformanceDetail(
        [ROLES.SALES_EXECUTIVE],
        "exec-1",
        "exec-1",
      ),
    ).toBe(true);
    expect(
      canViewExecutivePerformanceDetail(
        [ROLES.SALES_EXECUTIVE],
        "exec-1",
        "exec-2",
      ),
    ).toBe(false);
    expect(
      canViewExecutivePerformanceDetail(
        [ROLES.SALES_MANAGER],
        "mgr-1",
        "exec-2",
      ),
    ).toBe(true);
  });

  it("resolves restrict-to-self for executives and open scope for managers", () => {
    expect(resolveRestrictToUserId([ROLES.SALES_EXECUTIVE], "exec-1")).toBe(
      "exec-1",
    );
    expect(resolveRestrictToUserId([ROLES.SALES_MANAGER], "mgr-1")).toBeNull();
    expect(resolveRestrictToUserId([ROLES.SUPER_ADMIN], "admin-1")).toBeNull();
    expect(resolveRestrictToUserId([ROLES.WAREHOUSE], "wh-1")).toBeNull();
  });
});
