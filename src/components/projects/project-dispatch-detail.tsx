"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatProjectDispatchStatus } from "@/lib/projects";
import { formatDocumentDate } from "@/lib/utils";

type ProjectDispatchDetailData = {
  id: string;
  dispatchNo: string;
  status: string;
  vehicleNo?: string | null;
  receiverName?: string | null;
  receiverMobile?: string | null;
  remarks?: string | null;
  dispatchedAt?: string | null;
  project: {
    id: string;
    projectNo: string;
    customerName: string;
    customerMobile: string;
    siteAddress: string;
    proposal: { proposalNo: string };
  };
  warehouse: { name: string };
  lines: Array<{
    id: string;
    qty: number;
    kitProductName?: string | null;
    product: { displayName: string };
    serials: Array<{ serialNumber: string }>;
  }>;
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "DISPATCHED") return "success";
  if (status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function ProjectDispatchDetail({
  dispatch,
  canManage,
}: {
  dispatch: ProjectDispatchDetailData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/project-dispatches/${dispatch.id}/confirm`, {
      method: "POST",
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to confirm dispatch.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{dispatch.dispatchNo}</h1>
          <p className="text-sm text-slate-500">
            Project {dispatch.project.projectNo} · Proposal {dispatch.project.proposal.proposalNo}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventory/dispatches?tab=projects">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          {dispatch.status === "DISPATCHED" ? (
            <Button variant="outline" asChild>
              <a href={`/api/project-dispatches/${dispatch.id}/pdf`} target="_blank" rel="noreferrer">
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

      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(dispatch.status)}>
          {formatProjectDispatchStatus(dispatch.status)}
        </Badge>
        {dispatch.dispatchedAt ? (
          <span className="text-sm text-slate-500">
            Dispatched {formatDocumentDate(dispatch.dispatchedAt)}
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer & Site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Customer:</span> {dispatch.project.customerName}
            </p>
            <p>
              <span className="text-slate-500">Mobile:</span> {dispatch.project.customerMobile}
            </p>
            <p>
              <span className="text-slate-500">Site:</span> {dispatch.project.siteAddress}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispatch Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Warehouse:</span> {dispatch.warehouse.name}
            </p>
            <p>
              <span className="text-slate-500">Vehicle:</span> {dispatch.vehicleNo ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Receiver:</span> {dispatch.receiverName ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Receiver mobile:</span>{" "}
              {dispatch.receiverMobile ?? "—"}
            </p>
            {dispatch.remarks ? (
              <p>
                <span className="text-slate-500">Remarks:</span> {dispatch.remarks}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Serials</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispatch.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.kitProductName
                      ? `${line.product.displayName} (from ${line.kitProductName})`
                      : line.product.displayName}
                  </TableCell>
                  <TableCell className="text-right">{line.qty}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {line.serials.map((serial) => serial.serialNumber).join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dispatch.status === "DRAFT" && canManage ? (
        <div className="flex justify-end">
          <Button type="button" disabled={loading} onClick={() => void handleConfirm()}>
            {loading ? "Confirming…" : "Confirm Dispatch"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
