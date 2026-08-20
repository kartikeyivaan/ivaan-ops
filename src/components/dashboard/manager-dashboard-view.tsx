import { Suspense } from "react";
import type { ManagerDashboardDto } from "@/lib/sales-dashboard/dashboard-types";
import { DispatchTodayHero } from "@/components/dashboard/dispatch-today-hero";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { SalesPerformancePanel } from "@/components/dashboard/sales-performance-panel";
import { DashboardPeriodSelector } from "@/components/dashboard/dashboard-period-selector";
import { ApprovalsSummaryPanel } from "@/components/dashboard/approvals-summary-panel";
import { TeamScoreboardPanel } from "@/components/dashboard/team-scoreboard-panel";
import { PipelineRisksPanel } from "@/components/dashboard/pipeline-risks-panel";
import { StockConflictsPanel } from "@/components/dashboard/stock-conflicts-panel";
import {
  formatBusinessDateLong,
  formatBusinessMonthYear,
  getBusinessGreeting,
  PERIOD_LABELS,
} from "@/components/dashboard/dashboard-formatters";

type ManagerDashboardViewProps = {
  data: ManagerDashboardDto;
  userName: string;
  companyLabel?: string;
};

export function ManagerDashboardView({
  data,
  userName,
  companyLabel,
}: ManagerDashboardViewProps) {
  const firstName = userName.split(" ")[0] || userName;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {getBusinessGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-slate-500">
            Team sales dashboard · {formatBusinessDateLong(data.businessDate)}
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DispatchTodayHero
            data={data.dispatchOperations}
            title="Dispatch Operations"
            viewLabel="View all dispatches today"
          />
        </div>
        <ApprovalsSummaryPanel data={data.approvalSummary} />
      </div>

      <KpiStrip data={data.kpiStrip} />

      <TeamScoreboardPanel data={data.teamScoreboard} />

      <SalesPerformancePanel
        funnel={data.funnel}
        trend={data.trend}
        unitComposition={data.unitComposition}
        fromDate={data.fromDate}
        toDate={data.toDate}
        heading="Team Performance"
      />

      <PipelineRisksPanel data={data.pipelineRisks} />

      <StockConflictsPanel data={data.stockConflicts} />
    </div>
  );
}
