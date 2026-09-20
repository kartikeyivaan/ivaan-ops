import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/rbac";
import {
  authorizeDashboardRefresh,
  buildDashboardCacheKeyParts,
  buildDashboardCacheTag,
  dashboardCompanyKey,
  dashboardUserKey,
} from "@/lib/sales-dashboard/dashboard-cache";

describe("dashboard cache keys and tags", () => {
  it("builds a company key that is independent of id order", () => {
    expect(dashboardCompanyKey(["b", "a", "b"])).toBe("a,b");
    expect(dashboardCompanyKey(["a", "b"])).toBe("a,b");
  });

  it("treats all-companies scope as a different key", () => {
    expect(dashboardCompanyKey(["a", "b"], true)).toBe("all:a,b");
    expect(dashboardCompanyKey(["a", "b"], false)).toBe("a,b");
    expect(dashboardCompanyKey(["a", "b"], true)).not.toBe(
      dashboardCompanyKey(["a", "b"], false),
    );
  });

  it("includes kind, companies, user, period, dates, and trend in the cache key", () => {
    const identity = {
      kind: "executive" as const,
      companyIds: ["co-b", "co-a"],
      allCompanies: false,
      userKey: "exec-1",
    };
    const parts = buildDashboardCacheKeyParts(identity, {
      period: "month",
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      trendMetric: "modules",
    });

    expect(parts).toEqual([
      "sales-dashboard",
      "executive",
      "co-a,co-b",
      "exec-1",
      "month",
      "2026-09-01",
      "2026-09-30",
      "modules",
    ]);
  });

  it("changes the cache key when the period changes", () => {
    const identity = {
      kind: "manager" as const,
      companyIds: ["co-1"],
      userKey: "mgr-1",
    };

    const month = buildDashboardCacheKeyParts(identity, { period: "month" });
    const week = buildDashboardCacheKeyParts(identity, { period: "week" });

    expect(month).not.toEqual(week);
    expect(month[4]).toBe("month");
    expect(week[4]).toBe("week");
  });

  it("keeps the refresh tag independent of period so one Refresh busts every period", () => {
    const identity = {
      kind: "executive" as const,
      companyIds: ["co-b", "co-a"],
      allCompanies: false,
      userKey: "exec-1",
    };

    expect(buildDashboardCacheTag(identity)).toBe(
      "dashboard:executive:co-a,co-b:exec-1",
    );
    expect(buildDashboardCacheTag(identity)).not.toContain("month");
  });

  it("does not let one executive tag collide with a manager tag", () => {
    const companyIds = ["co-1"];
    const execTag = buildDashboardCacheTag({
      kind: "executive",
      companyIds,
      userKey: "exec-1",
    });
    const managerTag = buildDashboardCacheTag({
      kind: "manager",
      companyIds,
      userKey: "mgr-1",
    });
    expect(execTag).not.toBe(managerTag);
  });

  it("uses restrictToUserId for personal executive views and viewer id for team/legacy", () => {
    expect(
      dashboardUserKey({
        kind: "executive",
        userId: "mgr-1",
        restrictToUserId: "exec-9",
      }),
    ).toBe("exec-9");
    expect(
      dashboardUserKey({ kind: "manager", userId: "mgr-1", restrictToUserId: null }),
    ).toBe("mgr-1");
    expect(dashboardUserKey({ kind: "legacy", userId: "wh-1" })).toBe("wh-1");
  });
});

describe("authorizeDashboardRefresh", () => {
  it("lets an executive refresh only their own dashboard", () => {
    const self = authorizeDashboardRefresh({
      kind: "executive",
      viewerId: "exec-1",
      viewerRoles: [ROLES.SALES_EXECUTIVE],
      viewedUserId: "exec-1",
    });
    expect(self).toEqual({ ok: true, userKey: "exec-1" });

    const other = authorizeDashboardRefresh({
      kind: "executive",
      viewerId: "exec-1",
      viewerRoles: [ROLES.SALES_EXECUTIVE],
      viewedUserId: "exec-2",
    });
    expect(other.ok).toBe(false);
  });

  it("lets a manager refresh a viewed executive without wiping another kind", () => {
    const result = authorizeDashboardRefresh({
      kind: "executive",
      viewerId: "mgr-1",
      viewerRoles: [ROLES.SALES_MANAGER],
      viewedUserId: "exec-9",
    });
    expect(result).toEqual({ ok: true, userKey: "exec-9" });
  });

  it("rejects a warehouse user refreshing a manager dashboard", () => {
    const result = authorizeDashboardRefresh({
      kind: "manager",
      viewerId: "wh-1",
      viewerRoles: [ROLES.WAREHOUSE],
    });
    expect(result.ok).toBe(false);
  });

  it("allows a warehouse user to refresh their legacy dashboard", () => {
    const result = authorizeDashboardRefresh({
      kind: "legacy",
      viewerId: "wh-1",
      viewerRoles: [ROLES.WAREHOUSE],
    });
    expect(result).toEqual({ ok: true, userKey: "wh-1" });
  });
});
