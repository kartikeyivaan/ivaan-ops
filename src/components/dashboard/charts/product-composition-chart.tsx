"use client";

import { useRouter } from "next/navigation";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DispatchedUnitCompositionDto } from "@/lib/sales-dashboard/dashboard-types";
import { formatCompactNumber } from "@/components/dashboard/dashboard-formatters";
import { CHART_COLORS } from "@/components/dashboard/charts/chart-theme";

type ProductCompositionChartProps = {
  units: DispatchedUnitCompositionDto;
  fromDate: string;
  toDate: string;
  salesUserId?: string;
};

export function ProductCompositionChart({
  units,
  fromDate,
  toDate,
  salesUserId,
}: ProductCompositionChartProps) {
  const router = useRouter();

  const chartData = [
    { name: "Modules", value: units.modules, key: "modules" },
    { name: "Inverters", value: units.inverters, key: "inverters" },
    { name: "Other", value: units.other, key: "other" },
  ].filter((row) => row.value > 0);

  const total = units.modules + units.inverters + units.other;

  if (total === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        No dispatched units in this period.
      </p>
    );
  }

  function drilldown() {
    const params = new URLSearchParams({ report: "dispatch", fromDate, toDate });
    if (salesUserId) params.set("salesUserId", salesUserId);
    router.push(`/reports?${params}`);
  }

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={56}
            outerRadius={88}
            paddingAngle={2}
            onClick={drilldown}
            className="cursor-pointer"
          >
            {chartData.map((row, index) => (
              <Cell
                key={row.key}
                fill={CHART_COLORS.composition[index] ?? CHART_COLORS.emerald}
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const row = payload[0].payload as (typeof chartData)[number];
              const pct = Math.round((row.value / total) * 100);
              return (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                  <p className="font-medium text-slate-900">{row.name}</p>
                  <p className="text-slate-600">
                    {formatCompactNumber(row.value)} units · {pct}%
                  </p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-3 text-xs text-slate-600">
        {chartData.map((row, index) => (
          <span key={row.key} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: CHART_COLORS.composition[index] ?? CHART_COLORS.emerald,
              }}
            />
            {row.name}: {formatCompactNumber(row.value)}
          </span>
        ))}
      </div>
    </div>
  );
}
