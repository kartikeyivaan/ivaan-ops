import Link from "next/link";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DispatchTodayHeroDto } from "@/lib/sales-dashboard/dashboard-types";
import {
  buildTodayDispatchHref,
  formatCompactNumber,
} from "@/components/dashboard/dashboard-formatters";

export function DispatchTodayHero({
  data,
  salesUserId,
  title = "Today's Dispatches",
  viewLabel = "View today's dispatches",
}: {
  data: DispatchTodayHeroDto;
  salesUserId?: string;
  title?: string;
  viewLabel?: string;
}) {
  const completion = Math.min(100, Math.max(0, data.completionPercent));

  return (
    <Card className="border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5 text-emerald-700" />
            {title}
          </CardTitle>
          <p className="text-sm text-slate-500">India business date · {data.businessDate}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={buildTodayDispatchHref(salesUserId)}>{viewLabel}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Planned" value={data.planned} />
          <Metric label="Completed" value={data.completed} tone="success" />
          <Metric label="Pending" value={data.pending} tone="warning" />
          <Metric label="Blocked" value={data.blocked} tone={data.blocked > 0 ? "danger" : "default"} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Completion progress</span>
            <span className="font-medium text-slate-900">{completion}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <UnitPill label="Modules" value={data.moduleUnits} />
          <UnitPill label="Inverters" value={data.inverterUnits} />
          <UnitPill label="Other" value={data.otherUnits} />
        </div>

        {data.items.length > 0 ? (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700">Today&apos;s dispatch list</p>
            <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
              {data.items.slice(0, 6).map((item) => (
                <Link
                  key={item.piId}
                  href={`/sales/proforma-invoices/${item.piId}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.customerName}</p>
                    <p className="truncate text-xs text-slate-500">{item.piNo}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-slate-900";

  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-3xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function UnitPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{formatCompactNumber(value)} units</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "completed" | "pending" | "blocked" }) {
  if (status === "completed") return <Badge variant="success">Completed</Badge>;
  if (status === "blocked") return <Badge variant="danger">Blocked</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}
