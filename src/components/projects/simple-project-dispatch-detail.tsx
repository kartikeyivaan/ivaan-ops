"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatProjectDispatchStatus } from "@/lib/projects";
import { SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD } from "@/lib/simple-project-dispatch";
import { formatDocumentDate } from "@/lib/utils";
import { parseApiJson } from "@/lib/api-response";

type DispatchDetail = {
  id: string;
  dispatchNo: string;
  status: string;
  receiverName?: string | null;
  remarks?: string | null;
  dispatchedAt?: string | null;
  heading?: string;
  serialCount?: number;
  requiresApproval?: boolean;
  project: {
    id: string;
    projectNo: string;
    customerName: string;
    proposal?: { proposalNo: string } | null;
  };
  warehouse: { name: string };
  lines: Array<{
    id: string;
    qty: number;
    product: { displayName: string };
    serials: Array<{ serialNumber: string }>;
  }>;
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "DISPATCHED") return "success";
  if (status === "PENDING_APPROVAL" || status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function SimpleProjectDispatchDetail({
  dispatch,
  canConfirm,
  canCancel,
  canPrepare,
}: {
  dispatch: DispatchDetail;
  canConfirm: boolean;
  canCancel: boolean;
  canPrepare: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const serialCount =
    dispatch.serialCount ??
    dispatch.lines.reduce((sum, line) => sum + line.serials.length, 0);
  const isLarge = serialCount > SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD;
  const heading =
    dispatch.heading ??
    `Projects Dispatch - ${dispatch.project.projectNo} - ${dispatch.project.customerName}`;

  async function runAction(path: string, successMessage?: string) {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/simple-project-dispatches/${dispatch.id}/${path}`, {
      method: "POST",
    });
    const data = await parseApiJson(response);
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? successMessage ?? "Action failed.");
      return;
    }
    router.refresh();
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      "Cancel this delivery challan and restock serials at Projects WH?",
    );
    if (!confirmed) return;
    await runAction("cancel");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Simple Project Dispatch
          </p>
          <h1 className="text-2xl font-bold text-slate-900">{dispatch.dispatchNo}</h1>
          <p className="text-sm text-slate-600">{heading}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/projects/dispatch">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          {dispatch.status === "DISPATCHED" ? (
            <Button variant="outline" asChild>
              <a
                href={`/api/project-dispatches/${dispatch.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-4 w-4" />
                PDF
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant(dispatch.status)}>
          {formatProjectDispatchStatus(dispatch.status)}
        </Badge>
        {dispatch.dispatchedAt ? (
          <span className="text-sm text-slate-500">
            Dispatched {formatDocumentDate(dispatch.dispatchedAt)}
          </span>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-slate-500">Project:</span> {dispatch.project.projectNo}
          </p>
          <p>
            <span className="text-slate-500">Customer:</span> {dispatch.project.customerName}
          </p>
          <p>
            <span className="text-slate-500">Warehouse:</span> {dispatch.warehouse.name}
          </p>
          <p>
            <span className="text-slate-500">Receiver:</span> {dispatch.receiverName || "—"}
          </p>
          <p>
            <span className="text-slate-500">Serials:</span> {serialCount}
          </p>
          {dispatch.remarks ? (
            <p className="sm:col-span-2">
              <span className="text-slate-500">Remarks:</span> {dispatch.remarks}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {dispatch.lines.map((line) => (
            <div key={line.id} className="rounded-lg border border-slate-200 p-4">
              <p className="font-medium text-slate-900">
                {line.product.displayName} — {line.qty} Qty
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {line.serials.map((serial) => (
                  <li key={serial.serialNumber}>{serial.serialNumber}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {canPrepare &&
        dispatch.status === "DRAFT" &&
        isLarge ? (
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => runAction("submit-approval")}
          >
            Submit for approval
          </Button>
        ) : null}
        {canConfirm &&
        (dispatch.status === "DRAFT" || dispatch.status === "PENDING_APPROVAL") ? (
          <Button type="button" disabled={loading} onClick={() => runAction("confirm")}>
            {isLarge ? "Approve & confirm" : "Confirm dispatch"}
          </Button>
        ) : null}
        {canCancel && dispatch.status !== "CANCELLED" ? (
          <Button type="button" variant="outline" disabled={loading} onClick={handleCancel}>
            Cancel & restock
          </Button>
        ) : null}
      </div>
    </div>
  );
}
