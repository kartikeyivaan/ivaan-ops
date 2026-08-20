"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SalesFunnelDto } from "@/lib/sales-dashboard/dashboard-types";
import { buildKpiHref, formatCurrency } from "@/components/dashboard/dashboard-formatters";
import { CHART_AXIS, CHART_COLORS } from "@/components/dashboard/charts/chart-theme";

type SalesFunnelChartProps = {
  funnel: SalesFunnelDto;
  fromDate: string;
  toDate: string;
  salesUserId?: string;
};

export function SalesFunnelChart({
  funnel,
  fromDate,
  toDate,
  salesUserId,
}: SalesFunnelChartProps) {
  const router = useRouter();

  const steps = [
    {
      key: "quotation",
      name: "Quotation",
      value: funnel.quotationValue,
      conversion: null,
    },
    {
      key: "pi",
      name: "PI",
      value: funnel.piValue,
      conversion: funnel.conversion.quotationToPi,
    },
    {
      key: "collection",
      name: "Collection",
      value: funnel.collectionValue,
      conversion: funnel.conversion.piToCollection,
    },
    {
      key: "dispatch",
      name: "Dispatched",
      value: funnel.dispatchedValue,
      conversion: funnel.conversion.collectionToDispatch,
    },
  ] as const;

  const maxValue = Math.max(...steps.map((step) => step.value), 1);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={steps}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
      >
        <XAxis type="number" hide domain={[0, maxValue]} />
        <YAxis
          type="category"
          dataKey="name"
          width={88}
          tick={CHART_AXIS.tick}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(16, 185, 129, 0.08)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const row = payload[0].payload as (typeof steps)[number];
            return (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <p className="font-medium text-slate-900">{row.name}</p>
                <p className="text-slate-600">{formatCurrency(row.value)}</p>
                {row.conversion != null ? (
                  <p className="text-xs text-slate-500">Conversion: {row.conversion}%</p>
                ) : null}
              </div>
            );
          }}
        />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          onClick={(_, index) => {
            const row = steps[index];
            if (!row) return;
            router.push(
              buildKpiHref(
                row.key as "quotation" | "pi" | "collection" | "dispatch",
                fromDate,
                toDate,
                salesUserId,
              ),
            );
          }}
          className="cursor-pointer"
        >
          {steps.map((step, index) => (
            <Cell key={step.key} fill={CHART_COLORS.funnel[index] ?? CHART_COLORS.emerald} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value) => formatCurrency(Number(value))}
            className="fill-slate-700 text-xs"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
