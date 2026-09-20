import Link from "next/link";
import type { LegacyDashboardDto } from "@/lib/sales-dashboard/dashboard-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardRefreshControls } from "@/components/dashboard/dashboard-refresh-controls";
import { YourAttentionCard } from "@/components/tasks/your-attention-card";

export function LegacyRoleDashboard({ data }: { data: LegacyDashboardDto }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {data.companyLabel
              ? `Working in ${data.companyLabel}`
              : "No active company selected"}
          </p>
          {data.showTeamComingSoon ? (
            <p className="mt-2 text-sm text-amber-700">
              Team sales dashboard UI is coming in the next phase. Showing summary widgets for now.
            </p>
          ) : null}
        </div>
        <DashboardRefreshControls kind="legacy" generatedAt={data.generatedAt} />
      </div>

      <YourAttentionCard />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.widgets.map((widget) => {
          const card = (
            <Card className={widget.href ? "h-full transition hover:border-emerald-300" : undefined}>
              <CardHeader>
                <CardTitle className="text-base">{widget.title}</CardTitle>
                <CardDescription>{widget.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900">{widget.value}</p>
              </CardContent>
            </Card>
          );

          if (widget.href) {
            return (
              <Link key={widget.title} href={widget.href} className="block">
                {card}
              </Link>
            );
          }
          return <div key={widget.title}>{card}</div>;
        })}
      </div>
    </div>
  );
}
