import Link from "next/link";
import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModuleTargetProgressDto } from "@/lib/sales-dashboard/dashboard-types";
import { formatCompactNumber } from "@/components/dashboard/dashboard-formatters";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ModuleTargetCard({ data }: { data: ModuleTargetProgressDto }) {
  const progress = Math.min(100, Math.max(0, data.progressPercent));
  const exceeded = data.achievedModules > data.targetModules;

  return (
    <Card className="border-sky-100 bg-gradient-to-br from-white to-sky-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-sky-700" />
          Monthly Target
        </CardTitle>
        <p className="text-sm text-slate-500">
          {MONTH_NAMES[data.month - 1]} {data.year} · Dispatched module units
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Target</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatCompactNumber(data.targetModules)} modules
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Achieved</p>
            <p className="text-2xl font-semibold text-sky-800">
              {formatCompactNumber(data.achievedModules)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Progress</span>
            <span className="font-medium text-slate-900">{data.progressPercent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${
                exceeded ? "bg-emerald-500" : "bg-sky-500"
              }`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-slate-600">
            {exceeded
              ? `Exceeded by ${formatCompactNumber(data.achievedModules - data.targetModules)} modules`
              : `${formatCompactNumber(data.remainingModules)} remaining`}
          </p>
          <Link
            href="/reports?report=dispatch"
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            View dispatch report
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
