import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModuleMasteryJourneyDto } from "@/lib/module-mastery-service";
import { ModuleMasteryMonthlyChart } from "@/components/dashboard/module-mastery-monthly-chart";
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

export function ModuleMasteryJourneyView({ journey }: { journey: ModuleMasteryJourneyDto }) {
  const { current, stats } = journey;
  const progress = Math.min(100, Math.max(0, current.progressPercent));
  const completedLevelNumbers = new Set(
    journey.completedThisMonth.map((item) => item.levelNumber),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Module Mastery Journey</h1>
        <p className="text-sm text-slate-500">{journey.executiveName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="This month" value={`${formatCompactNumber(current.modulesDispatched)} modules`} />
        <StatCard
          label="Personal best"
          value={
            stats.personalBestMonth
              ? `${formatCompactNumber(stats.personalBestModules)} (${MONTH_NAMES[stats.personalBestMonth.month - 1]} ${stats.personalBestMonth.year})`
              : "—"
          }
        />
        <StatCard label="Highest level" value={stats.highestLevelName} />
        <StatCard label="Lifetime modules" value={formatCompactNumber(stats.lifetimeModules)} />
      </div>

      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="text-base">
            {MONTH_NAMES[current.month - 1]} {current.year} · Active challenge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Current level</p>
              <p className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
                <span>{current.currentLevelBadge}</span>
                {current.isGodLevel
                  ? current.currentLevelName
                  : `Level ${current.currentLevelNumber} — ${current.currentLevelName}`}
              </p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p>
                {formatCompactNumber(current.currentSlabProgress)} /{" "}
                {formatCompactNumber(current.slabSize)} in slab
              </p>
              <p>{formatCompactNumber(current.modulesToNext)} to next level</p>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">
            Next unlock: {current.nextLevelBadge} {current.nextLevelName}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Named levels this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {journey.levels.map((level) => {
              const completed = completedLevelNumbers.has(level.levelNumber);
              const active = current.currentLevelNumber === level.levelNumber && !current.isGodLevel;
              const locked = !completed && !active;
              return (
                <div
                  key={level.levelNumber}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                    active
                      ? "border-amber-200 bg-amber-50"
                      : completed
                        ? "border-emerald-100 bg-emerald-50/50"
                        : "border-slate-100 bg-slate-50/40 opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{level.badge}</span>
                    <span className="font-medium text-slate-800">
                      Level {level.levelNumber} — {level.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {completed ? <Badge variant="success">Completed</Badge> : null}
                    {active ? <Badge variant="warning">Active</Badge> : null}
                    {locked ? <Badge variant="default">Locked</Badge> : null}
                    <span className="text-xs text-slate-500">
                      {formatCompactNumber(level.thresholdModules)}
                    </span>
                  </div>
                </div>
              );
            })}
            {current.isGodLevel ? (
              <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">♾️ {current.currentLevelName}</span>
                <Badge variant="warning">Active</Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Achievement timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {journey.achievementTimeline.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No milestones recorded yet.
              </p>
            ) : (
              <div className="relative space-y-0 pl-4">
                <div className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
                {journey.achievementTimeline.slice(0, 12).map((item) => (
                  <div key={item.id} className="relative pb-4 pl-4">
                    <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-amber-400 bg-white" />
                    <p className="text-sm font-medium text-slate-800">
                      {item.badge} {item.levelName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {MONTH_NAMES[item.month - 1]} {item.year} ·{" "}
                      {new Date(item.achievedAt).toLocaleDateString("en-IN")} ·{" "}
                      {formatCompactNumber(item.thresholdModules)} modules
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly performance</CardTitle>
        </CardHeader>
        <CardContent>
          <ModuleMasteryMonthlyChart
            history={journey.monthlyHistory}
            personalBest={stats.personalBestMonth}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
