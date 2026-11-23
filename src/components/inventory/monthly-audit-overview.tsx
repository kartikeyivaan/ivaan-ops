"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Finding = { id: string; serialNumber: string; investigationNote: string | null };
export type AuditOverview = {
  audit: { id: string; auditNumber: string; status: string; approvedAt: string | null };
  serial: { expected: number; found: number; missing: Finding[]; additional: Finding[] };
  qty: { id: string; approved: boolean }[];
  scanSummary: { expected: number; found: number; additional: number; remaining: number };
};

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.message ?? fallback;
}

export function MonthlyAuditOverview({
  auditId,
  canManage,
  canScan,
}: {
  auditId: string;
  canManage: boolean;
  canScan: boolean;
}) {
  const [data, setData] = useState<AuditOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/inventory/monthly-audits/${auditId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(await readError(res, "Could not load this audit."));
      return;
    }
    setData(await res.json());
  }, [auditId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: "close" | "reopen" | "approve" | "cancel", confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/inventory/monthly-audits/${auditId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "cancel" ? JSON.stringify({ reason: cancelReason }) : undefined,
      });
      if (!res.ok) {
        setError(await readError(res, "Action failed."));
        return;
      }
      const body = await res.json();
      if (action === "approve") {
        const parts = ["Approved."];
        if (Array.isArray(body.changedSinceSnapshot) && body.changedSinceSnapshot.length) {
          parts.push(`Warning: ${body.changedSinceSnapshot.length} serial(s) left stock after the snapshot and were not changed.`);
        }
        if (body.uncountedCount > 0) {
          parts.push(`Warning: ${body.uncountedCount} non-serialized product(s) had no count and were left unchanged.`);
        }
        setNotice(parts.join(" "));
      } else {
        setNotice(`Done: ${action}.`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-slate-500">Loading...</p>;

  const { audit, serial, scanSummary } = data;
  const isOpen = audit.status === "OPEN";
  const isClosed = audit.status === "CLOSED";
  const isCancellable = isOpen || isClosed;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/inventory/monthly-audits" className="text-sm text-slate-500 underline">
            All monthly audits
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{audit.auditNumber}</h1>
          <p className="text-sm text-slate-600">Status: {audit.status}</p>
        </div>
        <a
          href={`/api/inventory/monthly-audits/${auditId}/report`}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          Download Excel
        </a>
      </div>

      {isOpen && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Stock movements are paused while scanning is open: incoming, transfer, adjust and dispatch are
          blocked. Dispatch resumes when scanning is closed, even before approval.
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Serials expected" value={scanSummary.expected} />
        <Stat label="Found" value={scanSummary.found} />
        <Stat label="Remaining" value={scanSummary.remaining} />
        <Stat label="Additional" value={scanSummary.additional} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <PanelCard
          href={`/inventory/monthly-audits/${auditId}/serial`}
          title="Serial Numbered Products"
          text={
            isOpen && canScan
              ? "Scan serial numbers. Each scan is saved straight away."
              : "View the scanned serial numbers by product."
          }
        />
        <PanelCard
          href={`/inventory/monthly-audits/${auditId}/non-serial`}
          title="Non Serial Numbered Products"
          text={
            isOpen && canScan
              ? "Enter the counted quantity for each product."
              : "View the counted quantities."
          }
        />
      </section>

      {!isOpen && (
        <section className="grid gap-4 md:grid-cols-2">
          <FindingList title={`Missing (in system, not scanned): ${serial.missing.length}`} rows={serial.missing} />
          <FindingList
            title={`Additional (scanned, not in system): ${serial.additional.length}`}
            rows={serial.additional}
          />
        </section>
      )}

      {canManage && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Actions (Super Admin)</h2>
          <div className="flex flex-wrap gap-2">
            {isOpen && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(
                    "close",
                    "Close scanning? Stock movements (incoming, transfer, adjust) resume. Dispatch is already allowed.",
                  )
                }
                className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Close scanning
              </button>
            )}
            {isClosed && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction("approve", "Approve? Non-serialized stock will be set to the counted quantities. This cannot be undone.")
                  }
                  className="rounded-md bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Approve and apply
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction("reopen", "Reopen scanning for this audit?")}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                >
                  Reopen scanning
                </button>
              </>
            )}
            {isCancellable && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancelling"
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || cancelReason.trim().length < 3}
                  onClick={() => runAction("cancel", "Cancel this monthly audit? Stock movements resume.")}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                >
                  Cancel audit
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function PanelCard({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-400">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function FindingList({ title, rows }: { title: string; rows: Finding[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-2 font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">None.</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-auto font-mono text-sm">
          {rows.map((row) => (
            <li key={row.id}>{row.serialNumber}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
