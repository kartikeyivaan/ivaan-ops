"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Warehouse = { id: string; name: string };

type OpeningAuditRow = {
  id: string;
  auditNumber: string;
  status: string;
  warehouseName: string;
  warehouseId: string;
  lineCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
};

type DailyAuditRow = {
  id: string;
  auditNumber: string;
  status: string;
  warehouseName: string;
  auditDate: string;
  lineCount: number;
  submittedAt: string | null;
};

function statusClass(status: string) {
  if (status === "APPROVED" || status === "SUBMITTED") {
    return status === "APPROVED"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-amber-100 text-amber-800";
  }
  if (status === "DRAFT") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

export function InventoryAuditHub({
  phase,
  inventoryTrackingStartDate,
  warehouses,
  openingAudits,
  dailyAudits,
  canReset,
  canCreate,
  canApprove,
}: {
  phase: string;
  inventoryTrackingStartDate: string | null;
  warehouses: Warehouse[];
  openingAudits: OpeningAuditRow[];
  dailyAudits: DailyAuditRow[];
  canReset: boolean;
  canCreate: boolean;
  canApprove: boolean;
  }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dailyWarehouseId, setDailyWarehouseId] = useState(warehouses[0]?.id ?? "");

  async function startOpening() {
    if (
      !confirm(
        "This will WIPE all physical stock for this company and block Incoming, Dispatch, Transfer, and Adjust until every warehouse Opening Audit is approved. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/inventory/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start_opening" }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.message ?? "Failed to start opening stock.");
      return;
    }
    router.refresh();
  }

  async function createDaily() {
    if (!dailyWarehouseId) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/inventory/audits/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId: dailyWarehouseId }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.message ?? "Failed to create daily audit.");
      return;
    }
    router.push(`/inventory/audits/daily/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inventory Audit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Opening Stock baseline and daily Modules/Inverters counts.
        </p>
      </div>

      {phase === "IN_PROGRESS" ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Opening Stock in progress</p>
            <p className="mt-1">
              Incoming, Dispatch, Transfer, and Adjust are blocked for all warehouses until every
              Opening Audit is approved.
            </p>
          </div>
        </div>
      ) : null}

      {phase === "COMPLETED" && inventoryTrackingStartDate ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Inventory tracking live since{" "}
          {new Date(inventoryTrackingStartDate).toLocaleString("en-IN")}.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Opening Stock Audit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === "NOT_STARTED" && canReset ? (
            <Button
              className="h-12 w-full text-base"
              disabled={busy}
              onClick={() => void startOpening()}
            >
              Reset stock & start Opening
            </Button>
          ) : null}

          {phase === "IN_PROGRESS" && canReset ? (
            <Button
              variant="outline"
              className="h-11 w-full"
              disabled={busy}
              onClick={() => void startOpening()}
            >
              Re-wipe stock (no approved audits yet)
            </Button>
          ) : null}

          {openingAudits.length === 0 ? (
            <p className="text-sm text-slate-500">No opening audits yet.</p>
          ) : (
            <ul className="space-y-2">
              {openingAudits.map((audit) => (
                <li key={audit.id}>
                  <Link
                    href={`/inventory/audits/opening/${audit.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{audit.warehouseName}</p>
                      <p className="text-xs text-slate-500">
                        {audit.auditNumber} · {audit.lineCount} lines
                        {canApprove && audit.status === "SUBMITTED" ? " · Needs approval" : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(audit.status)}`}
                    >
                      {audit.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="h-5 w-5" />
            Daily Product Count
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Modules & Inverters only. Blind count — system qty hidden until submit.
          </p>

          {phase !== "COMPLETED" ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Available after Opening Stock is fully approved.
            </p>
          ) : canCreate ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Warehouse
                <select
                  className="mt-1 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                  value={dailyWarehouseId}
                  onChange={(event) => setDailyWarehouseId(event.target.value)}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="h-12 w-full text-base"
                disabled={busy || !dailyWarehouseId}
                onClick={() => void createDaily()}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Daily Audit
              </Button>
            </div>
          ) : null}

          {dailyAudits.length === 0 ? (
            <p className="text-sm text-slate-500">No daily audits yet.</p>
          ) : (
            <ul className="space-y-2">
              {dailyAudits.map((audit) => (
                <li key={audit.id}>
                  <Link
                    href={`/inventory/audits/daily/${audit.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{audit.warehouseName}</p>
                      <p className="text-xs text-slate-500">
                        {audit.auditNumber} ·{" "}
                        {new Date(audit.auditDate).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(audit.status)}`}
                    >
                      {audit.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
