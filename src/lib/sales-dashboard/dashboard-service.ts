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
import type {
  ExecutiveDashboardDto,
  ManagerDashboardDto,
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
    companyId: scope.companyId,
    salesUserId: executiveId ?? scope.restrictToUserId ?? undefined,
    fromDate,
    toDate,
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
      companyId: scope.companyId,
      salesUserId: executiveId,
      businessDate,
    }),
    getWorkQueue(prisma, scope.companyId, executiveId),
    getOutstandingAging(prisma, scope.companyId, executiveId),
    getSalesStockWatch(prisma, scope.companyId, executiveId),
    getSalesFunnel(prisma, filters),
    getPerformanceTrend(prisma, filters, query.trendMetric ?? "modules"),
    buildDispatchedUnitTotals(prisma, filters),
    getCurrentMonthModuleTargetProgress(prisma, scope.companyId, executiveId),
    getExecutiveModuleMastery(prisma, scope.companyId, executiveId),
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
      modules: unitTotals.modules,
      inverters: unitTotals.inverters,
      other: unitTotals.other,
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
    getApprovalSummary(prisma, scope.companyId, scope.roles),
    getTeamScoreboard(
      prisma,
      scope.companyId,
      range.fromDate,
      range.toDate,
      period,
    ),
    getDispatchTodaySummary(prisma, {
      companyId: scope.companyId,
      businessDate,
    }),
    getPipelineRisks(prisma, scope.companyId),
    getStockConflicts(prisma, scope.companyId),
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
      modules: unitTotals.modules,
      inverters: unitTotals.inverters,
      other: unitTotals.other,
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
