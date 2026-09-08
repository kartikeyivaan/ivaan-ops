"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PiClosePartialDialog } from "@/components/proforma-invoices/pi-close-partial-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatProformaStatus } from "@/lib/proforma-invoices";
import { formatDocumentDate } from "@/lib/utils";

export type PendingDispatchRow = {
  id: string;
  piNo: string;
  status: string;
  customer: { customerName: string; customerCode: string };
  salesUser: { name: string };
  queuedAt: string | null;
  daysWaiting: number | null;
  remainingQty: number;
  hasOpenDispatchDraft: boolean;
  openDispatch: { id: string; dcNo: string } | null;
  canRecordDispatch: boolean;
  canRequestCancel: boolean;
  canClosePartial: boolean;
  closeLines: Array<{
    id: string;
    displayName: string;
    qty: number;
    dispatchedQty: number;
    remainingQty: number;
  }>;
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "BOOKED") return "success";
  if (status === "PARTIALLY_DISPATCHED") return "warning";
  if (status === "CANCEL_PENDING") return "warning";
  return "default";
}

export function PendingDispatchesList({
  initialRows,
  canApproveCancel,
}: {
  initialRows: PendingDispatchRow[];
  canApproveCancel: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [closeRow, setCloseRow] = useState<PendingDispatchRow | null>(null);

  async function requestCancel(row: PendingDispatchRow) {
    const confirmed = window.confirm(
      `Request cancellation of ${row.piNo}? A sales manager must approve before the PI is cancelled.`,
    );
    if (!confirmed) return;

    setLoadingId(row.id);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${row.id}/request-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    setLoadingId(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to request cancellation.");
      return;
    }
    setRows((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              status: "CANCEL_PENDING",
              canRecordDispatch: false,
              canRequestCancel: false,
              canClosePartial: false,
            }
          : item,
      ),
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pending Dispatch</h1>
        <p className="text-sm text-slate-500">
          PIs marked for dispatch at least once, still waiting to be fully dispatched, cancelled,
          or closed after a partial dispatch.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-16 text-center text-slate-500">
          No leftover PIs. Mark a booked PI for dispatch today and it will stay here until
          finished.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PI</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>First marked</TableHead>
                <TableHead>Days waiting</TableHead>
                <TableHead>Remaining qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/sales/proforma-invoices/${row.id}`}
                      className="font-medium text-emerald-800 hover:underline"
                    >
                      {row.piNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{row.customer.customerName}</div>
                    <div className="text-xs text-slate-500">{row.salesUser.name}</div>
                  </TableCell>
                  <TableCell>
                    {row.queuedAt ? formatDocumentDate(row.queuedAt) : "—"}
                  </TableCell>
                  <TableCell>{row.daysWaiting ?? "—"}</TableCell>
                  <TableCell>{row.remainingQty}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>
                      {formatProformaStatus(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.hasOpenDispatchDraft ? (
                        <span className="text-xs text-amber-700">
                          Open DC {row.openDispatch?.dcNo ?? ""} — finish or cancel it first
                        </span>
                      ) : null}
                      {row.canRecordDispatch ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/sales/pending-dispatches/${row.id}/record`}>
                            Record dispatch
                          </Link>
                        </Button>
                      ) : null}
                      {row.canRequestCancel ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loadingId === row.id}
                          onClick={() => void requestCancel(row)}
                        >
                          {loadingId === row.id ? "Requesting…" : "Cancel PI"}
                        </Button>
                      ) : null}
                      {row.status === "CANCEL_PENDING" ? (
                        <span className="text-xs text-slate-500">
                          {canApproveCancel ? "Awaiting your approval" : "Awaiting SM approval"}
                        </span>
                      ) : null}
                      {row.canClosePartial ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCloseRow(row)}
                        >
                          Close PI
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {closeRow ? (
        <PiClosePartialDialog
          piId={closeRow.id}
          piNo={closeRow.piNo}
          lines={closeRow.closeLines}
          open
          onOpenChange={(open) => {
            if (!open) setCloseRow(null);
          }}
          onClosed={() => {
            setRows((current) => current.filter((item) => item.id !== closeRow.id));
            setCloseRow(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
