"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { DashboardPeriod } from "@/lib/business-dates";
import { cn } from "@/lib/utils";
import { PERIOD_LABELS } from "@/components/dashboard/dashboard-formatters";

const PERIODS: DashboardPeriod[] = ["today", "week", "month", "quarter"];

export function DashboardPeriodSelector({ activePeriod }: { activePeriod: DashboardPeriod }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectPeriod(period: DashboardPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    params.delete("fromDate");
    params.delete("toDate");
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">
      {PERIODS.map((period) => {
        const active = activePeriod === period;
        return (
          <button
            key={period}
            type="button"
            onClick={() => selectPeriod(period)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {PERIOD_LABELS[period]}
          </button>
        );
      })}
    </div>
  );
}
