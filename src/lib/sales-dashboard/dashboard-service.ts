import type { PrismaClient } from "@prisma/client";
import {
  getBusinessToday,
  getPreviousPeriodRange,
  resolveDashboardPeriod,
  type DashboardPeriod,
} from "@/lib/business-dates";
import {
  buildDispatchedUnitTotals,
  buildKpiStrip,
  toCompanyIdFilter,
  type SalesMetricFilters,
} from "@/lib/report-builders";
import { getDispatchTodaySummary } from "@/lib/sales-dashboard/dispatch-today-service";
import { getWorkQueue } from "@/lib/sales-dashboard/work-queue-service";
import { getOutstandingAging } from "@/lib/sales-dashboard/outstanding-service";
import { getSalesStockWatch, getStockConflicts } from "@/lib/sales-dashboard/stock-watch-service";
import { getSalesFunnel } from "@/lib/sales-dashboard/funnel-service";
import { getPerformanceTrend } from "@/lib/sales-dashboard/trend-service";
import { getApprovalSummary } from "@/lib/sales-dashboard/approval-summary-service";
import { getTeamScoreboard } from "@/lib/sales-dashboard/team-service";
import { getPipelineRisks } from "@/lib/sales-dashboard/risk-service";
import { getCurrentMonthModuleTargetProgress } from "@/lib/sales-target-service";
import { getExecutiveModuleMastery } from "@/lib/module-mastery-service";
import { roundMoney } from "@/lib/quotations";
import type {
  ExecutiveDashboardDto,
  ManagerDashboardDto,
  ModuleMasteryProgressDto,
  ModuleTargetProgressDto,
  SalesDashboardDto,
  SalesDashboardScope,
} from "@/lib/sales-dashboard/dashboard-types";

export type SalesDashboardQuery = {
  period?: DashboardPeriod;
  fromDate?: string;
  toDate?: string;
  trendMetric?: "modules" | "dispatch" | "collection" | "pi";
};

function buildMetricFilters(
  scope: SalesDashboardScope,
  fromDate: string,
  toDate: string,
  executiveId?: string,
): SalesMetricFilters {
  return {
    companyId: toCompanyIdFilter(scope.companyIds),
    salesUserId: executiveId ?? scope.restrictToUserId ?? undefined,
    fromDate,
    toDate,
  };
}

async function sumModuleTargetProgress(
  prisma: PrismaClient,
  companyIds: string[],
  executiveId: string,
): Promise<ModuleTargetProgressDto> {
  const rows = await Promise.all(
    companyIds.map((companyId) =>
      getCurrentMonthModuleTargetProgress(prisma, companyId, executiveId),
    ),
  );
  const first = rows[0]!;
  const targetModules = rows.reduce((sum, row) => sum + row.targetModules, 0);
  const achievedModules = rows.reduce((sum, row) => sum + row.achievedModules, 0);
  const remainingModules = Math.max(0, targetModules - achievedModules);
  const progressPercent =
    targetModules > 0 ? Math.min(100, Math.round((achievedModules / targetModules) * 100)) : 0;

  return {
    year: first.year,
    month: first.month,
    targetModules,
    achievedModules,
    remainingModules,
    progressPercent,
    source: companyIds.length > 1 ? "COMPANY_DEFAULT" : first.source,
  };
}

async function sumModuleMasteryProgress(
  prisma: PrismaClient,
  companyIds: string[],
  executiveId: string,
): Promise<ModuleMasteryProgressDto> {
  const rows = await Promise.all(
    companyIds.map((companyId) => getExecutiveModuleMastery(prisma, companyId, executiveId)),
  );
  if (rows.length === 1) return rows[0]!;

  const modulesDispatched = rows.reduce((sum, row) => sum + row.modulesDispatched, 0);
  // Prefer the highest-progress company for level display when aggregating.
  const lead = rows.reduce((best, row) =>
    row.modulesDispatched > best.modulesDispatched ? row : best,
  );
  return {
    ...lead,
    modulesDispatched: roundMoney(modulesDispatched),
  };
}

export async function getExecutiveDashboard(
  prisma: PrismaClient,
  scope: SalesDashboardScope,
  query: SalesDashboardQuery = {},
): Promise<ExecutiveDashboardDto> {
  const businessDate = getBusinessToday();
  const period = query.period ?? "month";
  const range = resolveDashboardPeriod(period, {
    fromDate: query.fromDate,
    toDate: query.toDate,
  });
  const previousRange = getPreviousPeriodRange(range.fromDate, range.toDate);
  const executiveId = scope.restrictToUserId ?? scope.userId;
  const filters = buildMetricFilters(scope, range.fromDate, range.toDate, executiveId);
  const companyFilter = toCompanyIdFilter(scope.companyIds);

  const [
    kpiStrip,
    dispatchToday,
    workQueue,
    outstandingAging,
    stockWatch,
    funnel,
    trend,
    unitTotals,
    moduleTarget,
    moduleMastery,
  ] = await Promise.all([
    buildKpiStrip(prisma, filters, period, previousRange),
    getDispatchTodaySummary(prisma, {
      companyId: companyFilter,
      salesUserId: executiveId,
      businessDate,
    }),
    getWorkQueue(prisma, companyFilter, executiveId),
    getOutstandingAging(prisma, scope.companyIds, executiveId),
    getSalesStockWatch(prisma, companyFilter, executiveId),
    getSalesFunnel(prisma, filters),
    getPerformanceTrend(prisma, filters, query.trendMetric ?? "modules"),
    buildDispatchedUnitTotals(prisma, filters),
    sumModuleTargetProgress(prisma, scope.companyIds, executiveId),
    sumModuleMasteryProgress(prisma, scope.companyIds, executiveId),
  ]);

  return {
    role: "executive",
    businessDate,
    period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    kpiStrip,
    dispatchToday,
    workQueue,
    outstandingAging,
    stockWatch,
    funnel,
    trend,
    unitComposition: {
      modules: unitTotals.modules.actual,
      inverters: unitTotals.inverters.actual,
      other: unitTotals.other.actual,
    },
    moduleTarget,
    moduleMastery,
  };
}

export async function getManagerDashboard(
  prisma: PrismaClient,
  scope: SalesDashboardScope,
  query: SalesDashboardQuery = {},
): Promise<ManagerDashboardDto> {
  const businessDate = getBusinessToday();
  const period = query.period ?? "month";
  const range = resolveDashboardPeriod(period, {
    fromDate: query.fromDate,
    toDate: query.toDate,
  });
  const previousRange = getPreviousPeriodRange(range.fromDate, range.toDate);
  const filters = buildMetricFilters(scope, range.fromDate, range.toDate);
  const companyFilter = toCompanyIdFilter(scope.companyIds);

  const [
    kpiStrip,
    approvalSummary,
    teamScoreboard,
    dispatchOperations,
    pipelineRisks,
    stockConflicts,
    funnel,
    trend,
    unitTotals,
  ] = await Promise.all([
    buildKpiStrip(prisma, filters, period, previousRange),
    getApprovalSummary(prisma, scope.companyIds, scope.roles),
    getTeamScoreboard(
      prisma,
      companyFilter,
      range.fromDate,
      range.toDate,
      period,
    ),
    getDispatchTodaySummary(prisma, {
      companyId: companyFilter,
      businessDate,
    }),
    getPipelineRisks(prisma, companyFilter),
    getStockConflicts(prisma, companyFilter),
    getSalesFunnel(prisma, filters),
    getPerformanceTrend(prisma, filters, query.trendMetric ?? "modules"),
    buildDispatchedUnitTotals(prisma, filters),
  ]);

  return {
    role: "manager",
    businessDate,
    period,
    fromDate: range.fromDate,
    toDate: range.toDate,
    kpiStrip,
    approvalSummary,
    teamScoreboard,
    dispatchOperations,
    pipelineRisks,
    stockConflicts,
    funnel,
    trend,
    unitComposition: {
      modules: unitTotals.modules.actual,
      inverters: unitTotals.inverters.actual,
      other: unitTotals.other.actual,
    },
  };
}

export async function getSalesDashboard(
  prisma: PrismaClient,
  scope: SalesDashboardScope,
  query: SalesDashboardQuery = {},
): Promise<SalesDashboardDto> {
  if (scope.canViewTeam && !scope.restrictToUserId) {
    return getManagerDashboard(prisma, scope, query);
  }
  return getExecutiveDashboard(prisma, scope, query);
}
