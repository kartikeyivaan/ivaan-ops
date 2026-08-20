"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModuleMasteryJourneyDto } from "@/lib/module-mastery-service";
import { CHART_AXIS, CHART_COLORS } from "@/components/dashboard/charts/chart-theme";
import { formatCompactNumber } from "@/components/dashboard/dashboard-formatters";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ModuleMasteryMonthlyChart({
  history,
  personalBest,
}: {
  history: ModuleMasteryJourneyDto["monthlyHistory"];
  personalBest: { year: number; month: number } | null;
}) {
  const data = history.map((row) => ({
    label: `${MONTH_SHORT[row.month - 1]} ${String(row.year).slice(2)}`,
    modules: row.modulesDispatched,
    isBest:
      personalBest?.year === row.year && personalBest?.month === row.month,
  }));

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Monthly history will appear as you dispatch modules.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
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
          width={48}
          tickFormatter={(value) => formatCompactNumber(Number(value))}
        />
        <Tooltip
          cursor={{ fill: "rgba(245, 158, 11, 0.08)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const row = payload[0].payload as (typeof data)[number];
            return (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <p className="font-medium text-slate-900">{row.label}</p>
                <p className="text-slate-600">{formatCompactNumber(row.modules)} modules</p>
                {row.isBest ? (
                  <p className="text-xs text-amber-700">Personal best</p>
                ) : null}
              </div>
            );
          }}
        />
        <Bar
          dataKey="modules"
          radius={[4, 4, 0, 0]}
          fill={CHART_COLORS.amber}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
