"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OutstandingAgingDto } from "@/lib/sales-dashboard/dashboard-types";
import {
  AGEING_BUCKET_LABELS,
  formatCurrency,
} from "@/components/dashboard/dashboard-formatters";
import { CHART_AXIS, CHART_COLORS } from "@/components/dashboard/charts/chart-theme";

export function AgingHistogramChart({ data }: { data: OutstandingAgingDto }) {
  const router = useRouter();

  const chartData = data.buckets.map((bucket, index) => ({
    bucket: bucket.bucket,
    label: AGEING_BUCKET_LABELS[bucket.bucket],
    totalOutstanding: bucket.totalOutstanding,
    piCount: bucket.piCount,
    fill: CHART_COLORS.aging[index] ?? CHART_COLORS.amber,
  }));

  if (chartData.every((row) => row.totalOutstanding === 0)) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">No outstanding balance to show.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={92}
          tick={CHART_AXIS.tick}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(245, 158, 11, 0.08)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const row = payload[0].payload as (typeof chartData)[number];
            return (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <p className="font-medium text-slate-900">{row.label}</p>
                <p className="text-slate-600">{formatCurrency(row.totalOutstanding)}</p>
                <p className="text-xs text-slate-500">{row.piCount} PIs</p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="totalOutstanding"
          radius={[0, 6, 6, 0]}
          onClick={(_, index) => {
            const row = chartData[index];
            if (!row) return;
            const params = new URLSearchParams({
              report: "payment-followup",
              ageingBucket: row.bucket,
            });
            router.push(`/reports?${params}`);
          }}
          className="cursor-pointer"
        >
          {chartData.map((row) => (
            <Cell key={row.bucket} fill={row.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
