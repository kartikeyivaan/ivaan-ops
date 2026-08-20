import Link from "next/link";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OutstandingAgingDto } from "@/lib/sales-dashboard/dashboard-types";
import { formatCurrency } from "@/components/dashboard/dashboard-formatters";
import { ChartSkeleton } from "@/components/dashboard/charts/chart-skeleton";

const AgingHistogramChart = dynamic(
  () =>
    import("@/components/dashboard/charts/aging-histogram-chart").then(
      (module) => module.AgingHistogramChart,
    ),
  { loading: () => <ChartSkeleton height={220} /> },
);

export function OutstandingAgingPanel({ data }: { data: OutstandingAgingDto }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Outstanding Collections</CardTitle>
        <Link
          href="/reports?report=payment-followup"
          className="text-xs font-medium text-emerald-700 hover:underline"
        >
          View report
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-slate-500">Total outstanding</p>
          <p className="text-2xl font-semibold text-slate-900">
            {formatCurrency(data.totalOutstanding)}
          </p>
        </div>
        <AgingHistogramChart data={data} />
      </CardContent>
    </Card>
  );
}
