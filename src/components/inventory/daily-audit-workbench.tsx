"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DailyLine = {
  id: string;
  productId: string;
  systemQty: number | null;
  physicalQty: number | null;
  varianceQty: number | null;
  hasVariance: boolean | null;
  remarks: string | null;
  product: {
    id: string;
    displayName: string;
    serialTracking: boolean;
    category: { id: string; name: string };
  };
};

type DailyAudit = {
  id: string;
  auditNumber: string;
  status: string;
  auditDate: string;
  warehouse: { id: string; name: string };
  lines: DailyLine[];
};

export function DailyAuditWorkbench({
  initialAudit,
  canEdit,
}: {
  initialAudit: DailyAudit;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDraft = audit.status === "DRAFT";
  const incomplete = audit.lines.filter((line) => line.physicalQty == null).length;
  const varianceCount = audit.lines.filter((line) => line.hasVariance).length;

  async function saveLine(line: DailyLine, physicalQty: string, remarks: string) {
    setBusyLineId(line.id);
    setMessage(null);
    const response = await fetch(
      `/api/inventory/audits/daily/${audit.id}/lines/${line.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicalQty: Number(physicalQty),
          remarks: remarks || null,
        }),
      },
    );
    const data = await response.json();
    setBusyLineId(null);
    if (!response.ok) {
      setMessage(data.message ?? "Failed to save count.");
      return;
    }
    setAudit(data);
  }

  async function submit() {
    if (!confirm("Submit daily count? Variances will be flagged with remarks.")) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/inventory/audits/daily/${audit.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit" }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.message ?? "Failed to submit.");
      return;
    }
    setAudit(data);
    router.refresh();
  }

  const modules = audit.lines.filter((l) => l.product.category.name === "Modules");
  const inverters = audit.lines.filter((l) => l.product.category.name === "Inverters");

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-28">
      <div className="flex items-start gap-3">
        <Button variant="outline" asChild className="mt-0.5 shrink-0 h-10 w-10 p-0">
          <Link href="/inventory/audits">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{audit.warehouse.name}</h1>
          <p className="text-sm text-slate-500">
            {audit.auditNumber} · {new Date(audit.auditDate).toLocaleDateString("en-IN")} ·{" "}
            {audit.status}
          </p>
          {isDraft ? (
            <p className="mt-1 text-xs text-slate-500">
              Blind count — enter physical qty without seeing system stock.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              {varianceCount} product{varianceCount === 1 ? "" : "s"} with variance
            </p>
          )}
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {message}
        </div>
      ) : null}

      <CategorySection
        title="Modules"
        lines={modules}
        isDraft={isDraft}
        canEdit={canEdit}
        busyLineId={busyLineId}
        onSave={saveLine}
      />
      <CategorySection
        title="Inverters"
        lines={inverters}
        isDraft={isDraft}
        canEdit={canEdit}
        busyLineId={busyLineId}
        onSave={saveLine}
      />

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {isDraft && canEdit ? (
            <Button
              className="h-12 w-full text-base"
              disabled={busy || incomplete > 0}
              onClick={() => void submit()}
            >
              {incomplete > 0
                ? `Submit (${incomplete} remaining)`
                : "Submit daily count"}
            </Button>
          ) : (
            <p className="text-center text-sm text-slate-600">Submitted</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CategorySection({
  title,
  lines,
  isDraft,
  canEdit,
  busyLineId,
  onSave,
}: {
  title: string;
  lines: DailyLine[];
  isDraft: boolean;
  canEdit: boolean;
  busyLineId: string | null;
  onSave: (line: DailyLine, physicalQty: string, remarks: string) => Promise<void>;
}) {
  if (lines.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {lines.map((line) => (
        <DailyLineCard
          key={line.id}
          line={line}
          isDraft={isDraft}
          canEdit={canEdit}
          busy={busyLineId === line.id}
          onSave={onSave}
        />
      ))}
    </section>
  );
}

function DailyLineCard({
  line,
  isDraft,
  canEdit,
  busy,
  onSave,
}: {
  line: DailyLine;
  isDraft: boolean;
  canEdit: boolean;
  busy: boolean;
  onSave: (line: DailyLine, physicalQty: string, remarks: string) => Promise<void>;
}) {
  const [physicalQty, setPhysicalQty] = useState(
    line.physicalQty == null ? "" : String(line.physicalQty),
  );
  const [remarks, setRemarks] = useState(line.remarks ?? "");

  const varianceClass =
    line.hasVariance == null
      ? "border-slate-200"
      : line.hasVariance
        ? "border-rose-300 bg-rose-50"
        : "border-emerald-300 bg-emerald-50";

  return (
    <div className={cn("rounded-xl border bg-white p-4", varianceClass)}>
      <p className="font-medium text-slate-900">{line.product.displayName}</p>

      {!isDraft || line.systemQty != null ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-white/80 p-2">
            <p className="text-slate-500">System</p>
            <p className="text-base font-semibold text-slate-900">
              {line.systemQty ?? "—"}
            </p>
          </div>
          <div className="rounded-lg bg-white/80 p-2">
            <p className="text-slate-500">Physical</p>
            <p className="text-base font-semibold text-slate-900">
              {line.physicalQty ?? "—"}
            </p>
          </div>
          <div className="rounded-lg bg-white/80 p-2">
            <p className="text-slate-500">Diff</p>
            <p
              className={cn(
                "text-base font-semibold",
                line.varianceQty && line.varianceQty !== 0
                  ? "text-rose-700"
                  : "text-emerald-700",
              )}
            >
              {line.varianceQty == null
                ? "—"
                : line.varianceQty > 0
                  ? `+${line.varianceQty}`
                  : line.varianceQty}
            </p>
          </div>
        </div>
      ) : null}

      {isDraft && canEdit ? (
        <div className="mt-3 space-y-2">
          <div>
            <Label>Physical qty</Label>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              className="mt-1 h-12 text-base"
              value={physicalQty}
              onChange={(e) => setPhysicalQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Remarks</Label>
            <Input
              className="mt-1 h-11 text-base"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Required if variance after submit"
            />
          </div>
          <Button
            className="h-11 w-full"
            disabled={busy || physicalQty === ""}
            onClick={() => void onSave(line, physicalQty, remarks)}
          >
            {busy ? "Saving…" : "Save count"}
          </Button>
        </div>
      ) : line.remarks ? (
        <p className="mt-2 text-sm text-slate-600">Remarks: {line.remarks}</p>
      ) : null}
    </div>
  );
}
