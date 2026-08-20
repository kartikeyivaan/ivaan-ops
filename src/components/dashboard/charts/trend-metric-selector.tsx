"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { PerformanceTrendDto } from "@/lib/sales-dashboard/dashboard-types";
import { cn } from "@/lib/utils";

const METRICS: Array<{ id: PerformanceTrendDto["metric"]; label: string }> = [
  { id: "modules", label: "Module Units" },
  { id: "dispatch", label: "Dispatch Value" },
  { id: "collection", label: "Collection" },
  { id: "pi", label: "PI Value" },
];

export function TrendMetricSelector({ activeMetric }: { activeMetric: PerformanceTrendDto["metric"] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectMetric(metric: PerformanceTrendDto["metric"]) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trendMetric", metric);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">
      {METRICS.map((metric) => {
        const active = activeMetric === metric.id;
        return (
          <button
            key={metric.id}
            type="button"
            onClick={() => selectMetric(metric.id)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs font-medium transition-all",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {metric.label}
          </button>
        );
      })}
    </div>
  );
}
