"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, ShieldCheck, XCircle } from "lucide-react";
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
import { formatDispatchStatus } from "@/lib/dispatches";
import { formatCurrency } from "@/lib/quotations";

type DispatchDetailData = {
  id: string;
  dcNo: string;
  status: string;
  dispatchDate: string;
  vehicleNo?: string | null;
  driverName?: string | null;
  notes?: string | null;
  totalValue: number;
  customer: { customerName: string; gstNumber: string };
  proformaInvoice: { piNo: string };
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
  if (status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function DispatchDetail({
  dispatch,
  canManage,
  canApproveCancel,
}: {
  dispatch: DispatchDetailData;
  canManage: boolean;
  canApproveCancel: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/dispatches/${dispatch.id}/confirm`, { method: "POST" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to confirm dispatch.");
      return;
    }
    router.refresh();
  }

  async function handleRequestCancel() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/dispatches/${dispatch.id}/request-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to request cancellation.");
      return;
    }
    router.refresh();
  }

  async function handleApproveCancel() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/dispatches/${dispatch.id}/approve-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to approve cancellation.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{dispatch.dcNo}</h1>
          <p className="text-sm text-slate-500">
            {dispatch.customer.customerName} · {dispatch.proformaInvoice.piNo}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="h-12">
            <Link href="/inventory/dispatches">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          {dispatch.status !== "DRAFT" && dispatch.status !== "CANCELLED" ? (
            <Button variant="outline" asChild className="h-12">
              <a href={`/api/dispatches/${dispatch.id}/pdf`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                DC PDF
              </a>
            </Button>
          ) : null}
          {canManage && dispatch.status === "DRAFT" ? (
            <Button className="h-12" disabled={loading} onClick={handleConfirm}>
              Confirm Dispatch
            </Button>
          ) : null}
          {canManage && dispatch.status === "DISPATCHED" ? (
            <Button variant="secondary" className="h-12" disabled={loading} onClick={handleRequestCancel}>
              <XCircle className="h-4 w-4" />
              Request Cancel
            </Button>
          ) : null}
          {canApproveCancel && dispatch.status === "CANCEL_PENDING" ? (
            <Button variant="secondary" className="h-12" disabled={loading} onClick={handleApproveCancel}>
              <ShieldCheck className="h-4 w-4" />
              Approve Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={statusVariant(dispatch.status)}>
              {formatDispatchStatus(dispatch.status)}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Date</CardTitle>
          </CardHeader>
          <CardContent>{dispatch.dispatchDate}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Warehouse</CardTitle>
          </CardHeader>
          <CardContent>{dispatch.warehouse.name}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Value</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(dispatch.totalValue)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Serials</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispatch.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.product.displayName}</TableCell>
                  <TableCell>{line.qty}</TableCell>
                  <TableCell>
                    {line.serials.map((serial) => serial.serialNumber).join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
