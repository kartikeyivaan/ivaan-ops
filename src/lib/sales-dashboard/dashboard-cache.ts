import { unstable_cache } from "next/cache";
import type { Session } from "next-auth";
import { isAllCompaniesScope, resolveDashboardCompanyIds } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";
import {
  canViewExecutivePerformanceDetail,
  canViewSalesDashboard,
  canViewTeamSalesDashboard,
  resolveRestrictToUserId,
} from "@/lib/sales-dashboard/dashboard-permissions";
import {
  getExecutiveDashboard,
  getManagerDashboard,
  type SalesDashboardQuery,
} from "@/lib/sales-dashboard/dashboard-service";
import { getLegacyDashboard } from "@/lib/sales-dashboard/legacy-dashboard";
import type {
  DashboardKind,
  ExecutiveDashboardDto,
  LegacyDashboardDto,
  LegacyDashboardScope,
  ManagerDashboardDto,
  SalesDashboardScope,
} from "@/lib/sales-dashboard/dashboard-types";

export type { DashboardKind };

export type DashboardCacheIdentity = {
  kind: DashboardKind;
  companyIds: string[];
  allCompanies?: boolean;
  userKey: string;
};

export type DashboardCacheQuery = {
  period?: string;
  fromDate?: string;
  toDate?: string;
  trendMetric?: string;
};

const CACHE_PREFIX = "sales-dashboard";

function sortedCompanyIds(companyIds: string[]): string[] {
  return [...new Set(companyIds.filter(Boolean))].sort();
}

export function dashboardCompanyKey(
  companyIds: string[],
  allCompanies = false,
): string {
  const joined = sortedCompanyIds(companyIds).join(",") || "none";
  return allCompanies ? `all:${joined}` : joined;
}

export function dashboardUserKey(input: {
  kind: DashboardKind;
  userId: string;
  restrictToUserId?: string | null;
}): string {
  if (input.kind === "legacy") return input.userId;
  return input.restrictToUserId || input.userId;
}

export function buildDashboardCacheTag(identity: DashboardCacheIdentity): string {
  const companyKey = dashboardCompanyKey(identity.companyIds, identity.allCompanies);
  return `dashboard:${identity.kind}:${companyKey}:${identity.userKey}`;
}

export function buildDashboardCacheKeyParts(
  identity: DashboardCacheIdentity,
  query: DashboardCacheQuery = {},
): string[] {
  return [
    CACHE_PREFIX,
    identity.kind,
    dashboardCompanyKey(identity.companyIds, identity.allCompanies),
    identity.userKey,
    query.period ?? "",
    query.fromDate ?? "",
    query.toDate ?? "",
    query.trendMetric ?? "",
  ];
}

export function authorizeDashboardRefresh(input: {
  kind: DashboardKind;
  viewerId: string;
  viewerRoles: string[];
  viewedUserId?: string | null;
}): { ok: true; userKey: string } | { ok: false; error: string } {
  if (input.kind === "legacy") {
    return { ok: true, userKey: input.viewerId };
  }

  if (input.kind === "manager") {
    if (!canViewTeamSalesDashboard(input.viewerRoles)) {
      return { ok: false, error: "You cannot refresh this dashboard." };
    }
    return { ok: true, userKey: input.viewerId };
  }

  if (!canViewSalesDashboard(input.viewerRoles)) {
    return { ok: false, error: "You cannot refresh this dashboard." };
  }

  const targetId =
    input.viewedUserId ||
    resolveRestrictToUserId(input.viewerRoles, input.viewerId) ||
    input.viewerId;

  if (!canViewExecutivePerformanceDetail(input.viewerRoles, input.viewerId, targetId)) {
    return { ok: false, error: "You cannot refresh this dashboard." };
  }

  return { ok: true, userKey: targetId };
}

export function salesDashboardCacheIdentity(
  kind: "manager" | "executive",
  scope: SalesDashboardScope,
  allCompanies: boolean,
): DashboardCacheIdentity {
  return {
    kind,
    companyIds: scope.companyIds,
    allCompanies,
    userKey: dashboardUserKey({
      kind,
      userId: scope.userId,
      restrictToUserId: scope.restrictToUserId,
    }),
  };
}

export function legacyDashboardScopeFromSession(session: Session): LegacyDashboardScope {
  const activeCompany = (session.user.companies ?? []).find(
    (company) => company.id === session.user.activeCompanyId,
  );
  return {
    userId: session.user.id,
    roles: session.user.roles ?? [],
    companyIds: resolveDashboardCompanyIds(session),
    allCompanies: isAllCompaniesScope(session.user.activeCompanyId),
    activeCompanyId: session.user.activeCompanyId ?? null,
    companyLabel: activeCompany
      ? `${activeCompany.name} (${activeCompany.code})`
      : null,
  };
}

export function getCachedExecutiveDashboard(
  scope: SalesDashboardScope,
  query: SalesDashboardQuery,
  allCompanies: boolean,
): Promise<ExecutiveDashboardDto> {
  const identity = salesDashboardCacheIdentity("executive", scope, allCompanies);
  const keyQuery: DashboardCacheQuery = {
    period: query.period ?? "month",
    fromDate: query.fromDate ?? "",
    toDate: query.toDate ?? "",
    trendMetric: query.trendMetric ?? "modules",
  };

  return unstable_cache(
    async () => getExecutiveDashboard(prisma, scope, query),
    buildDashboardCacheKeyParts(identity, keyQuery),
    { tags: [buildDashboardCacheTag(identity)], revalidate: false },
  )();
}

export function getCachedManagerDashboard(
  scope: SalesDashboardScope,
  query: SalesDashboardQuery,
  allCompanies: boolean,
): Promise<ManagerDashboardDto> {
  const identity = salesDashboardCacheIdentity("manager", scope, allCompanies);
  const keyQuery: DashboardCacheQuery = {
    period: query.period ?? "month",
    fromDate: query.fromDate ?? "",
    toDate: query.toDate ?? "",
    trendMetric: query.trendMetric ?? "modules",
  };

  return unstable_cache(
    async () => getManagerDashboard(prisma, scope, query),
    buildDashboardCacheKeyParts(identity, keyQuery),
    { tags: [buildDashboardCacheTag(identity)], revalidate: false },
  )();
}

export function getCachedLegacyDashboard(
  scope: LegacyDashboardScope,
): Promise<LegacyDashboardDto> {
  const identity: DashboardCacheIdentity = {
    kind: "legacy",
    companyIds: scope.companyIds,
    allCompanies: scope.allCompanies,
    userKey: dashboardUserKey({ kind: "legacy", userId: scope.userId }),
  };

  return unstable_cache(
    async () => getLegacyDashboard(prisma, scope),
    buildDashboardCacheKeyParts(identity),
    { tags: [buildDashboardCacheTag(identity)], revalidate: false },
  )();
}
