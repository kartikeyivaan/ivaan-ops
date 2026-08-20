"use client";

import { useEffect, useState, useTransition } from "react";
import { SalesModuleTargetScope } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SalesTargetAdminRow } from "@/lib/sales-target-service";

type ExecutiveOption = { id: string; name: string; email: string };

type TargetsPayload = {
  targets: {
    companyDefault: SalesTargetAdminRow;
    executiveDefaults: SalesTargetAdminRow[];
    monthlyOverrides: SalesTargetAdminRow[];
  };
  executives: ExecutiveOption[];
};

const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

export function SalesTargetsAdmin({
  initialData,
}: {
  initialData: TargetsPayload;
}) {
  const [data, setData] = useState(initialData);
  const [companyTarget, setCompanyTarget] = useState(
    String(initialData.targets.companyDefault.targetModules),
  );
  const [executiveId, setExecutiveId] = useState(
    initialData.executives[0]?.id ?? "",
  );
  const [executiveTarget, setExecutiveTarget] = useState("3000");
  const [monthlyExecutiveId, setMonthlyExecutiveId] = useState(
    initialData.executives[0]?.id ?? "",
  );
  const [monthlyYear, setMonthlyYear] = useState(String(new Date().getFullYear()));
  const [monthlyMonth, setMonthlyMonth] = useState(String(new Date().getMonth() + 1));
  const [monthlyTarget, setMonthlyTarget] = useState("3000");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCompanyTarget(String(data.targets.companyDefault.targetModules));
  }, [data.targets.companyDefault.targetModules]);

  async function refresh() {
    const response = await fetch("/api/settings/sales-targets");
    if (!response.ok) throw new Error("Failed to reload targets.");
    const payload = (await response.json()) as TargetsPayload;
    setData(payload);
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      try {
        await action();
        await refresh();
        setMessage("Saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  async function putTarget(body: unknown) {
    const response = await fetch("/api/settings/sales-targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? "Save failed.");
    }
  }

  async function removeTarget(id: string) {
    const response = await fetch(`/api/settings/sales-targets?id=${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? "Delete failed.");
    }
  }

  return (
    <div className="space-y-6">
      {(message || error) && (
        <p className={`text-sm ${error ? "text-red-700" : "text-emerald-700"}`}>
          {error ?? message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Default Target</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="companyTarget">Modules / month</Label>
            <Input
              id="companyTarget"
              type="number"
              min={1}
              value={companyTarget}
              onChange={(event) => setCompanyTarget(event.target.value)}
              className="w-40"
            />
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              run(() =>
                putTarget({
                  scope: SalesModuleTargetScope.COMPANY_DEFAULT,
                  targetModules: Number(companyTarget),
                }),
              )
            }
          >
            Save company default
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Executive Default Override</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="executiveId">Executive</Label>
              <select
                id="executiveId"
                className="flex h-10 w-56 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={executiveId}
                onChange={(event) => setExecutiveId(event.target.value)}
              >
                {data.executives.map((executive) => (
                  <option key={executive.id} value={executive.id}>
                    {executive.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="executiveTarget">Modules / month</Label>
              <Input
                id="executiveTarget"
                type="number"
                min={1}
                value={executiveTarget}
                onChange={(event) => setExecutiveTarget(event.target.value)}
                className="w-40"
              />
            </div>
            <Button
              disabled={pending || !executiveId}
              onClick={() =>
                run(() =>
                  putTarget({
                    scope: SalesModuleTargetScope.EXECUTIVE_DEFAULT,
                    executiveId,
                    targetModules: Number(executiveTarget),
                  }),
                )
              }
            >
              Save override
            </Button>
          </div>

          <OverridesTable
            rows={data.targets.executiveDefaults}
            onDelete={(id) => run(() => removeTarget(id))}
            pending={pending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Executive Override</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="monthlyExecutiveId">Executive</Label>
              <select
                id="monthlyExecutiveId"
                className="flex h-10 w-56 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={monthlyExecutiveId}
                onChange={(event) => setMonthlyExecutiveId(event.target.value)}
              >
                {data.executives.map((executive) => (
                  <option key={executive.id} value={executive.id}>
                    {executive.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="monthlyYear">Year</Label>
              <Input
                id="monthlyYear"
                type="number"
                value={monthlyYear}
                onChange={(event) => setMonthlyYear(event.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="monthlyMonth">Month</Label>
              <select
                id="monthlyMonth"
                className="flex h-10 w-28 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={monthlyMonth}
                onChange={(event) => setMonthlyMonth(event.target.value)}
              >
                {MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="monthlyTarget">Modules</Label>
              <Input
                id="monthlyTarget"
                type="number"
                min={1}
                value={monthlyTarget}
                onChange={(event) => setMonthlyTarget(event.target.value)}
                className="w-40"
              />
            </div>
            <Button
              disabled={pending || !monthlyExecutiveId}
              onClick={() =>
                run(() =>
                  putTarget({
                    scope: SalesModuleTargetScope.MONTHLY_OVERRIDE,
                    executiveId: monthlyExecutiveId,
                    year: Number(monthlyYear),
                    month: Number(monthlyMonth),
                    targetModules: Number(monthlyTarget),
                  }),
                )
              }
            >
              Save monthly override
            </Button>
          </div>

          <OverridesTable
            rows={data.targets.monthlyOverrides}
            showPeriod
            onDelete={(id) => run(() => removeTarget(id))}
            pending={pending}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function OverridesTable({
  rows,
  showPeriod = false,
  onDelete,
  pending,
}: {
  rows: SalesTargetAdminRow[];
  showPeriod?: boolean;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No overrides configured.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Executive</TableHead>
          {showPeriod ? <TableHead>Period</TableHead> : null}
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.executiveName ?? "—"}</TableCell>
            {showPeriod ? (
              <TableCell>
                {row.month}/{row.year}
              </TableCell>
            ) : null}
            <TableCell className="text-right">{row.targetModules}</TableCell>
            <TableCell className="text-right">
              {row.id ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onDelete(row.id!)}
                >
                  Remove
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
