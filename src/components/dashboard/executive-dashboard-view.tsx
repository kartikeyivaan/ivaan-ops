import { Suspense } from "react";
import Link from "next/link";
import type { ExecutiveDashboardDto } from "@/lib/sales-dashboard/dashboard-types";
import { DispatchTodayHero } from "@/components/dashboard/dispatch-today-hero";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { WorkQueuePanel } from "@/components/dashboard/work-queue-panel";
import { OutstandingAgingPanel } from "@/components/dashboard/outstanding-aging-panel";
import { StockWatchPanel } from "@/components/dashboard/stock-watch-panel";
import { SalesPerformancePanel } from "@/components/dashboard/sales-performance-panel";
import { QuickActionsBar } from "@/components/dashboard/quick-actions-bar";
import { DashboardPeriodSelector } from "@/components/dashboard/dashboard-period-selector";
import { ModuleTargetCard } from "@/components/dashboard/module-target-card";
import { ModuleMasteryCard } from "@/components/dashboard/module-mastery-card";
import { ModuleMasteryCelebration } from "@/components/dashboard/module-mastery-celebration";
import {
  formatBusinessDateLong,
  formatBusinessMonthYear,
  getBusinessGreeting,
  PERIOD_LABELS,
} from "@/components/dashboard/dashboard-formatters";

type ExecutiveDashboardViewProps = {
  data: ExecutiveDashboardDto;
  userName: string;
  salesUserId: string;
  companyLabel?: string;
  backHref?: string;
  pageHeading?: string;
};

export function ExecutiveDashboardView({
  data,
  userName,
  salesUserId,
  companyLabel,
  backHref,
  pageHeading,
}: ExecutiveDashboardViewProps) {
  const firstName = userName.split(" ")[0] || userName;

  return (
    <div className="space-y-6">
      <ModuleMasteryCelebration mastery={data.moduleMastery} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          {backHref ? (
            <Link
              href={backHref}
              className="text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
            >
              ← Back to team dashboard
            </Link>
          ) : null}
          <h1 className="text-2xl font-bold text-slate-900">
            {pageHeading ?? `${getBusinessGreeting()}, ${firstName}`}
          </h1>
          <p className="text-sm text-slate-500">
            Today: {formatBusinessDateLong(data.businessDate)}
            {companyLabel ? ` · ${companyLabel}` : ""}
          </p>
          <p className="text-xs text-slate-400">
            KPI period: {PERIOD_LABELS[data.period]} ({formatBusinessMonthYear(data.fromDate)})
          </p>
        </div>
        <Suspense fallback={<div className="h-10 w-64 animate-pulse rounded-md bg-slate-100" />}>
          <DashboardPeriodSelector activePeriod={data.period} />
        </Suspense>
      </div>

      <QuickActionsBar />

      <DispatchTodayHero data={data.dispatchToday} salesUserId={salesUserId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ModuleMasteryCard data={data.moduleMastery} />
        <ModuleTargetCard data={data.moduleTarget} />
      </div>

      <KpiStrip data={data.kpiStrip} salesUserId={salesUserId} />

      <SalesPerformancePanel
        funnel={data.funnel}
        trend={data.trend}
        unitComposition={data.unitComposition}
        fromDate={data.fromDate}
        toDate={data.toDate}
        salesUserId={salesUserId}
      />

      <WorkQueuePanel data={data.workQueue} salesUserId={salesUserId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <OutstandingAgingPanel data={data.outstandingAging} />
        <StockWatchPanel data={data.stockWatch} />
      </div>
    </div>
  );
}
