"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { BOOKING_ADVANCE_PERCENT, formatPaymentMode, formatProformaStatus } from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";
import { formatPricingType } from "@/lib/products";

type Warehouse = { id: string; name: string; code: string | null };

type ProformaInvoiceDetailData = {
  id: string;
  piNo: string;
  status: string;
  piDate: string;
  totalValue: number;
  notes?: string | null;
  bookedAt?: string | null;
  customer: { id: string; customerName: string; gstNumber: string };
  salesUser: { name: string; email: string };
  quotation?: { quotationNo: string } | null;
  warehouse?: { name: string } | null;
  bookedBy?: { name: string } | null;
  items: Array<{
    id: string;
    qty: number;
    rate: number;
    gstRate: number;
    lineTotal: number;
    product: { displayName: string; pricingType: "WP" | "UNIT" };
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentDate: string;
    paymentMode: string;
    referenceNo?: string | null;
    recordedBy: { name: string };
  }>;
  paymentSummary: {
    totalPaid: number;
    outstanding: number;
    advanceRequired: number;
    canRequestBooking: boolean;
  };
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "ISSUED" || status === "BOOKED") return "success";
  if (status === "PENDING_BOOKING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function ProformaInvoiceDetail({
  pi,
  warehouses,
  canManage,
  canRecordPayments,
  canApproveBooking,
}: {
  pi: ProformaInvoiceDetailData;
  warehouses: Warehouse[];
  canManage: boolean;
  canRecordPayments: boolean;
  canApproveBooking: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("BANK_TRANSFER");
  const [referenceNo, setReferenceNo] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");

  async function handleIssue() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/issue`, { method: "POST" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to issue PI.");
      return;
    }
    router.refresh();
  }

  async function handleRecordPayment() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(paymentAmount),
        paymentDate,
        paymentMode,
        referenceNo: referenceNo || undefined,
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to record payment.");
      return;
    }
    setPaymentAmount("");
    setReferenceNo("");
    router.refresh();
  }

  async function handleRequestBooking() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/request-booking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to request booking.");
      return;
    }
    router.refresh();
  }

  async function handleApproveBooking() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/approve-booking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to approve booking.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pi.piNo}</h1>
          <p className="text-sm text-slate-500">
            {pi.customer.customerName}
            {pi.quotation ? ` · from ${pi.quotation.quotationNo}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/sales/proforma-invoices">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          {pi.status !== "DRAFT" ? (
            <Button variant="outline" asChild>
              <a href={`/api/proforma-invoices/${pi.id}/pdf`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                PDF
              </a>
            </Button>
          ) : null}
          {canManage && pi.status === "DRAFT" ? (
            <Button disabled={loading} onClick={handleIssue}>
              <Send className="h-4 w-4" />
              Issue PI
            </Button>
          ) : null}
          {canApproveBooking && pi.status === "PENDING_BOOKING" ? (
            <Button variant="secondary" disabled={loading} onClick={handleApproveBooking}>
              <ShieldCheck className="h-4 w-4" />
              Approve Booking
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
            <Badge variant={statusVariant(pi.status)}>{formatProformaStatus(pi.status)}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PI Date</CardTitle>
          </CardHeader>
          <CardContent>{pi.piDate}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Value</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatCurrency(pi.totalValue)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(pi.paymentSummary.outstanding)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
          <div>
            <p className="text-slate-500">Total Paid</p>
            <p className="text-lg font-semibold">{formatCurrency(pi.paymentSummary.totalPaid)}</p>
          </div>
          <div>
            <p className="text-slate-500">{BOOKING_ADVANCE_PERCENT}% Advance Required</p>
            <p className="text-lg font-semibold">
              {formatCurrency(pi.paymentSummary.advanceRequired)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Booking Eligible</p>
            <p className="text-lg font-semibold">
              {pi.paymentSummary.canRequestBooking ? "Yes" : "No"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>GST</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pi.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product.displayName}</TableCell>
                  <TableCell>{item.qty}</TableCell>
                  <TableCell>
                    {formatCurrency(item.rate)} ({formatPricingType(item.product.pricingType)})
                  </TableCell>
                  <TableCell>{item.gstRate}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pi.payments.length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Recorded By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pi.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.paymentDate}</TableCell>
                    <TableCell>{formatPaymentMode(payment.paymentMode)}</TableCell>
                    <TableCell>{payment.referenceNo ?? "—"}</TableCell>
                    <TableCell>{payment.recordedBy.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {canRecordPayments && ["ISSUED", "PENDING_BOOKING"].includes(pi.status) ? (
            <div className="grid gap-3 rounded-md border p-4 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <select
                  value={paymentMode}
                  onChange={(event) => setPaymentMode(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button disabled={loading} onClick={handleRecordPayment}>
                  Record Payment
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canManage && pi.status === "ISSUED" && pi.paymentSummary.canRequestBooking ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Booking</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <select
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
                className="flex h-10 min-w-[220px] rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
            <Button disabled={loading || !warehouseId} onClick={handleRequestBooking}>
              Request Booking Approval
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {pi.status === "BOOKED" ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-600">
            Booked on {pi.bookedAt?.slice(0, 10) ?? "—"}
            {pi.warehouse ? ` from ${pi.warehouse.name}` : ""}
            {pi.bookedBy ? ` by ${pi.bookedBy.name}` : ""}.
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
