import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DispatchedUnitCompositionDto,
  PerformanceTrendDto,
  SalesFunnelDto,
} from "@/lib/sales-dashboard/dashboard-types";
import { ChartSkeleton } from "@/components/dashboard/charts/chart-skeleton";
import { TrendMetricSelector } from "@/components/dashboard/charts/trend-metric-selector";

const SalesFunnelChart = dynamic(
  () =>
    import("@/components/dashboard/charts/sales-funnel-chart").then(
      (module) => module.SalesFunnelChart,
    ),
  { loading: () => <ChartSkeleton height={260} /> },
);

const PerformanceTrendChart = dynamic(
  () =>
    import("@/components/dashboard/charts/performance-trend-chart").then(
      (module) => module.PerformanceTrendChart,
    ),
  { loading: () => <ChartSkeleton height={260} /> },
);

const ProductCompositionChart = dynamic(
  () =>
    import("@/components/dashboard/charts/product-composition-chart").then(
      (module) => module.ProductCompositionChart,
    ),
  { loading: () => <ChartSkeleton height={220} /> },
);

type SalesPerformancePanelProps = {
  funnel: SalesFunnelDto;
  trend: PerformanceTrendDto;
  unitComposition: DispatchedUnitCompositionDto;
  fromDate: string;
  toDate: string;
  salesUserId?: string;
  heading?: string;
};

export function SalesPerformancePanel({
  funnel,
  trend,
  unitComposition,
  fromDate,
  toDate,
  salesUserId,
  heading = "My Sales Performance",
}: SalesPerformancePanelProps) {
  const conversions = [
    { label: "Quote → PI", value: funnel.conversion.quotationToPi },
    { label: "PI → Collection", value: funnel.conversion.piToCollection },
    { label: "Collection → Dispatch", value: funnel.conversion.collectionToDispatch },
  ] as const;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">{heading}</CardTitle>
          <p className="text-sm text-slate-500">
            Funnel conversion, daily trend, and dispatched unit mix for the selected period.
          </p>
        </div>
        <Suspense fallback={<div className="h-8 w-56 animate-pulse rounded-md bg-slate-100" />}>
          <TrendMetricSelector activeMetric={trend.metric} />
        </Suspense>
      </CardHeader>
      <CardContent className="grid gap-8 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-1">
          <p className="text-sm font-medium text-slate-700">Sales funnel</p>
          <SalesFunnelChart
            funnel={funnel}
            fromDate={fromDate}
            toDate={toDate}
            salesUserId={salesUserId}
          />
          <div className="grid grid-cols-3 gap-2">
            {conversions.map((conversion) => (
              <div key={conversion.label} className="rounded-md border border-slate-100 px-2 py-2">
                <p className="text-xs text-slate-500">{conversion.label}</p>
                <p className="text-sm font-semibold text-slate-900">
                  {conversion.value == null ? "—" : `${conversion.value}%`}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 xl:col-span-1">
          <p className="text-sm font-medium text-slate-700">Performance trend</p>
          <PerformanceTrendChart
            trend={trend}
            fromDate={fromDate}
            toDate={toDate}
            salesUserId={salesUserId}
          />
        </div>

        <div className="space-y-3 xl:col-span-1">
          <p className="text-sm font-medium text-slate-700">Dispatched unit mix</p>
          <ProductCompositionChart
            units={unitComposition}
            fromDate={fromDate}
            toDate={toDate}
            salesUserId={salesUserId}
          />
        </div>
      </CardContent>
    </Card>
  );
}
