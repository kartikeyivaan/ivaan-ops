import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModuleMasteryProgressDto } from "@/lib/sales-dashboard/dashboard-types";
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

export function ModuleMasteryCard({ data }: { data: ModuleMasteryProgressDto }) {
  const progress = Math.min(100, Math.max(0, data.progressPercent));

  return (
    <Card className="border-amber-100 bg-gradient-to-br from-white to-amber-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-xl" aria-hidden>
            {data.currentLevelBadge}
          </span>
          Module Mastery
        </CardTitle>
        <p className="text-sm text-slate-500">
          {MONTH_NAMES[data.month - 1]} {data.year} · Dispatched module units
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Current level</p>
            <p className="text-2xl font-semibold text-slate-900">
              {data.isGodLevel ? data.currentLevelName : `Level ${data.currentLevelNumber}`}
            </p>
            <p className="text-sm font-medium text-amber-800">{data.currentLevelName}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Modules this month</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatCompactNumber(data.modulesDispatched)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">
              Slab progress {formatCompactNumber(data.currentSlabProgress)} /{" "}
              {formatCompactNumber(data.slabSize)}
            </span>
            <span className="font-medium text-slate-900">{data.progressPercent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {formatCompactNumber(data.modulesToNext)} modules to next level
            {data.highestCompletedLevel > 0
              ? ` · ${data.highestCompletedLevel} completed`
              : ""}
          </p>
        </div>

        <div className="rounded-md border border-amber-100 bg-white/70 px-3 py-2 text-sm">
          <p className="text-slate-500">Next unlock</p>
          <p className="font-medium text-slate-900">
            {data.nextLevelBadge} {data.nextLevelName}
          </p>
        </div>

        {data.pendingCelebrations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.pendingCelebrations.slice(0, 3).map((item) => (
              <Badge key={item.id} variant="success">
                Unlocked {item.levelName}
              </Badge>
            ))}
          </div>
        ) : null}

        <Link
          href="/dashboard/module-mastery"
          className="inline-block text-xs font-medium text-amber-800 hover:underline"
        >
          View my journey →
        </Link>
      </CardContent>
    </Card>
  );
}
