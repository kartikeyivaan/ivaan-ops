"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuditRow = {
  id: string;
  auditNumber: string;
  status: string;
  startedAt: string;
  approvedAt: string | null;
  startedBy: { name: string } | null;
  approvedBy: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open (scanning)",
  CLOSED: "Closed (awaiting approval)",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export function MonthlyAuditList({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function load() {
    const res = await fetch("/api/inventory/monthly-audits", { cache: "no-store" });
    if (!res.ok) {
      setError("Could not load monthly audits.");
      return;
    }
    setAudits(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function startRun() {
    if (!confirm(
      "Start a monthly audit for ALL companies and warehouses?\n\n" +
        "Incoming, transfer and adjust will be paused until the audit is closed.",
    )) return;
    setStarting(true);
    setError(null);
    const res = await fetch("/api/inventory/monthly-audits", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setStarting(false);
    if (!res.ok) {
      setError(body.message ?? "Could not start the audit.");
      return;
    }
    router.push(`/inventory/monthly-audits/${body.id}`);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Monthly Serial Audit</h1>
          <p className="text-sm text-slate-500">
            One run covers every company and warehouse.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={startRun}
            disabled={starting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {starting ? "Starting..." : "Start monthly audit"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {audits === null ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : audits.length === 0 ? (
        <p className="text-sm text-slate-500">No monthly audits yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Audit</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2">Approved</th>
                <th className="px-3 py-2">Investigation</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link
                      href={`/inventory/monthly-audits/${audit.id}`}
                      className="font-medium text-slate-900 underline"
                    >
                      {audit.auditNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL[audit.status] ?? audit.status}</td>
                  <td className="px-3 py-2">{new Date(audit.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{audit.startedBy?.name ?? "-"}</td>
                  <td className="px-3 py-2">
                    {audit.approvedAt
                      ? `${new Date(audit.approvedAt).toLocaleDateString()} by ${audit.approvedBy?.name ?? "-"}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {audit.status === "APPROVED" ? (
                      <Link
                        href={`/inventory/monthly-audits/${audit.id}/investigation`}
                        className="rounded-md border border-slate-300 px-3 py-1 text-sm"
                      >
                        Investigate
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
