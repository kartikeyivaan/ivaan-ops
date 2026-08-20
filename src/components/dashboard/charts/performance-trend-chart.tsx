"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PerformanceTrendDto } from "@/lib/sales-dashboard/dashboard-types";
import {
  formatCompactNumber,
  formatCurrency,
} from "@/components/dashboard/dashboard-formatters";
import {
  CHART_AXIS,
  CHART_COLORS,
  formatChartDateLabel,
} from "@/components/dashboard/charts/chart-theme";

type PerformanceTrendChartProps = {
  trend: PerformanceTrendDto;
  fromDate: string;
  toDate: string;
  salesUserId?: string;
};

function formatTrendValue(metric: PerformanceTrendDto["metric"], value: number): string {
  return metric === "modules" ? `${formatCompactNumber(value)} units` : formatCurrency(value);
}

function trendDrilldownHref(
  metric: PerformanceTrendDto["metric"],
  date: string,
  salesUserId?: string,
): string {
  const params = new URLSearchParams({ fromDate: date, toDate: date });
  if (salesUserId) params.set("salesUserId", salesUserId);

  if (metric === "pi") return `/sales/proforma-invoices?${params}`;
  if (metric === "collection") {
    params.set("report", "payment-followup");
    return `/reports?${params}`;
  }
  params.set("report", "dispatch");
  return `/reports?${params}`;
}

export function PerformanceTrendChart({
  trend,
  salesUserId,
}: PerformanceTrendChartProps) {
  const router = useRouter();
  const data = trend.points.map((point) => ({
    ...point,
    label: formatChartDateLabel(point.date),
  }));

  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">No trend data for this period.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={CHART_AXIS.tick}
          axisLine={{ stroke: CHART_AXIS.stroke }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={CHART_AXIS.tick}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(value) =>
            trend.metric === "modules"
              ? formatCompactNumber(Number(value))
              : `₹${Math.round(Number(value) / 1000)}k`
          }
        />
        <Tooltip
          cursor={{ fill: "rgba(16, 185, 129, 0.08)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const row = payload[0].payload as (typeof data)[number];
            return (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <p className="font-medium text-slate-900">{row.date}</p>
                <p className="text-slate-600">{formatTrendValue(trend.metric, row.value)}</p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="value"
          fill={CHART_COLORS.emerald}
          radius={[4, 4, 0, 0]}
          onClick={(_, index) => {
            const row = data[index];
            if (!row) return;
            router.push(trendDrilldownHref(trend.metric, row.date, salesUserId));
          }}
          className="cursor-pointer"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
