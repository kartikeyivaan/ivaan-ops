"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, MessageCircle, Send, ShieldCheck, Truck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  canRecordPaymentAgainstPi,
  formatPaymentMode,
  formatProformaStatus,
  formatReceivedInAccount,
} from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";
import { formatDocumentDate } from "@/lib/utils";
import { formatPricingType } from "@/lib/products";

type Warehouse = { id: string; name: string; code: string | null };

type ChallanShare = {
  id: string;
  dcNo: string;
  whatsappUrl: string | null;
};

type ProformaInvoiceDetailData = {
  id: string;
  piNo: string;
  status: string;
  piDate: string;
  totalValue: number;
  notes?: string | null;
  bookedAt?: string | null;
  deliveryTermMode?: string | null;
  deliveryTermNoteSnapshot?: string | null;
  requiredDispatchMinDate?: string | null;
  requiredDispatchMaxDate?: string | null;
  daysUntilCommittedDispatch?: number | null;
  customer: { id: string; customerName: string; gstNumber: string; mobile?: string | null };
  salesUser: { name: string };
  quotation?: { quotationNo: string } | null;
  warehouse?: { name: string } | null;
  bookedBy?: { name: string } | null;
  dispatchToday?: {
    date: string | null;
    active: boolean;
    markedAt: string | null;
    markedBy: { id: string; name: string } | null;
    pendingApproval: boolean;
    needsEarlyApproval: boolean;
    draft: {
      vehicleNo: string | null;
      driverName: string | null;
      receiverName: string | null;
      receiverMobile: string | null;
      notes: string | null;
    };
  };
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
    receivedInAccount?: string | null;
    referenceNo?: string | null;
    recordedBy: { name: string };
  }>;
  paymentSummary: {
    totalPaid: number;
    outstanding: number;
    requiredPaymentPercent: number;
    advanceRequired: number;
    canRequestBooking: boolean;
    readyForDispatch?: boolean;
    canMarkDispatchToday?: boolean;
  };
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "ISSUED" || status === "BOOKED") return "success";
  if (status === "PENDING_BOOKING" || status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function ProformaInvoiceDetail({
  pi,
  warehouses,
  whatsappUrl,
  challanShares = [],
  canManage,
  canRecordPayments,
  canApproveBooking,
  canMarkDispatchToday,
  canApproveDispatchToday,
  canRequestCancel,
  canApproveCancel,
}: {
  pi: ProformaInvoiceDetailData;
  warehouses: Warehouse[];
  whatsappUrl?: string | null;
  challanShares?: ChallanShare[];
  canManage: boolean;
  canRecordPayments: boolean;
  canApproveBooking: boolean;
  canMarkDispatchToday: boolean;
  canApproveDispatchToday: boolean;
  canRequestCancel: boolean;
  canApproveCancel: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("BANK_TRANSFER");
  const [receivedInAccount, setReceivedInAccount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [vehicleNo, setVehicleNo] = useState(pi.dispatchToday?.draft.vehicleNo ?? "");
  const [driverName, setDriverName] = useState(pi.dispatchToday?.draft.driverName ?? "");
  const [receiverName, setReceiverName] = useState(pi.dispatchToday?.draft.receiverName ?? "");
  const [receiverMobile, setReceiverMobile] = useState(
    pi.dispatchToday?.draft.receiverMobile ?? "",
  );
  const [dispatchNotes, setDispatchNotes] = useState(pi.dispatchToday?.draft.notes ?? "");
  const showRecordPayment =
    canRecordPayments &&
    canRecordPaymentAgainstPi(pi.status, pi.paymentSummary.outstanding);
  const readyForDispatch =
    pi.paymentSummary.readyForDispatch ??
    ((pi.status === "BOOKED" || pi.status === "PARTIALLY_DISPATCHED") &&
      pi.paymentSummary.outstanding <= 0);
  const dispatchToday = pi.dispatchToday;
  const showDispatchTodayCard =
    readyForDispatch &&
    (canMarkDispatchToday || canApproveDispatchToday || dispatchToday?.active);

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
    setError("");
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setError("Amount is required.");
      return;
    }
    if (!paymentDate) {
      setError("Payment date is required.");
      return;
    }
    if (!paymentMode) {
      setError("Payment mode is required.");
      return;
    }
    if (!receivedInAccount) {
      setError("Received in A/c is required.");
      return;
    }
    if (!referenceNo.trim()) {
      setError("Reference is required.");
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/proforma-invoices/${pi.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(paymentAmount),
        paymentDate,
        paymentMode,
        receivedInAccount,
        referenceNo: referenceNo.trim(),
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to record payment.");
      return;
    }
    setPaymentAmount("");
    setReceivedInAccount("");
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

  async function handleRejectBooking() {
    const reason = window.prompt("Rejection reason (min 3 characters):");
    if (reason == null) return;
    if (reason.trim().length < 3) {
      setError("A rejection reason is required (min 3 characters).");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/reject-booking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to reject booking.");
      return;
    }
    router.refresh();
  }

  async function submitDispatchToday(confirmEarly = false) {
    setLoading(true);
    setError("");
    setWarning("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/dispatch-today`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmEarly,
        vehicleNo: vehicleNo || undefined,
        driverName: driverName || undefined,
        receiverName: receiverName || undefined,
        receiverMobile: receiverMobile || undefined,
        notes: dispatchNotes || undefined,
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (response.status === 409 && data.code === "EARLY_DISPATCH_CONFIRMATION_REQUIRED") {
      const days = data.details?.daysUntil ?? pi.daysUntilCommittedDispatch ?? "?";
      setWarning(
        `Committed delivery date is after ${days} day(s)` +
          (data.details?.committedDate
            ? ` (${formatDocumentDate(data.details.committedDate)})`
            : "") +
          ". Confirm to continue.",
      );
      return;
    }
    if (!response.ok) {
      setError(data.message ?? "Unable to mark dispatch today.");
      return;
    }
    router.refresh();
  }

  async function handleApproveDispatchToday() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/approve-dispatch-today`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to approve dispatch today.");
      return;
    }
    router.refresh();
  }

  async function handleRejectDispatchToday() {
    const reason = window.prompt("Rejection reason (min 3 characters):");
    if (reason == null) return;
    if (reason.trim().length < 3) {
      setError("A rejection reason is required (min 3 characters).");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/reject-dispatch-today`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to reject dispatch today.");
      return;
    }
    router.refresh();
  }

  async function handleRequestCancel() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/request-cancel`, {
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
    const response = await fetch(`/api/proforma-invoices/${pi.id}/approve-cancel`, {
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

  async function handleRejectCancel() {
    const reason = window.prompt("Rejection reason (min 3 characters):");
    if (reason == null) return;
    if (reason.trim().length < 3) {
      setError("A rejection reason is required (min 3 characters).");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch(`/api/proforma-invoices/${pi.id}/reject-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to reject cancellation.");
      return;
    }
    router.refresh();
  }

  function openWhatsapp(url: string | null | undefined) {
    if (!url) {
      setError("Add a valid mobile number for this customer to share on WhatsApp.");
      return;
    }
    setError("");
    window.open(url, "_blank", "noopener,noreferrer");
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
          {pi.status !== "DRAFT" &&
          pi.status !== "CANCELLED" &&
          pi.status !== "CANCEL_PENDING" ? (
            <Button variant="outline" asChild>
              <a href={`/api/proforma-invoices/${pi.id}/pdf`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                PDF
              </a>
            </Button>
          ) : null}
          {pi.status !== "DRAFT" &&
          pi.status !== "CANCELLED" &&
          pi.status !== "CANCEL_PENDING" ? (
            <Button variant="outline" onClick={() => openWhatsapp(whatsappUrl)}>
              <MessageCircle className="h-4 w-4" />
              Share on WhatsApp
            </Button>
          ) : null}
          {challanShares.length === 1 ? (
            <Button
              variant="outline"
              onClick={() => openWhatsapp(challanShares[0].whatsappUrl)}
            >
              <MessageCircle className="h-4 w-4" />
              Share Delivery Challan
            </Button>
          ) : null}
          {challanShares.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MessageCircle className="h-4 w-4" />
                  Share Delivery Challan
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {challanShares.map((challan) => (
                  <DropdownMenuItem
                    key={challan.id}
                    onClick={() => openWhatsapp(challan.whatsappUrl)}
                  >
                    {challan.dcNo}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canManage && pi.status === "DRAFT" ? (
            <Button disabled={loading} onClick={handleIssue}>
              <Send className="h-4 w-4" />
              Issue PI
            </Button>
          ) : null}
          {canApproveBooking && pi.status === "PENDING_BOOKING" ? (
            <>
              <Button variant="secondary" disabled={loading} onClick={handleApproveBooking}>
                <ShieldCheck className="h-4 w-4" />
                Approve Booking
              </Button>
              <Button variant="outline" disabled={loading} onClick={handleRejectBooking}>
                <XCircle className="h-4 w-4" />
                Reject Booking
              </Button>
            </>
          ) : null}
          {canApproveDispatchToday && dispatchToday?.pendingApproval ? (
            <>
              <Button variant="secondary" disabled={loading} onClick={handleApproveDispatchToday}>
                <ShieldCheck className="h-4 w-4" />
                Approve Dispatch Today
              </Button>
              <Button variant="outline" disabled={loading} onClick={handleRejectDispatchToday}>
                <XCircle className="h-4 w-4" />
                Reject Dispatch Today
              </Button>
            </>
          ) : null}
          {canRequestCancel &&
          ["DRAFT", "ISSUED", "PENDING_BOOKING", "BOOKED"].includes(pi.status) ? (
            <Button variant="secondary" disabled={loading} onClick={handleRequestCancel}>
              <XCircle className="h-4 w-4" />
              Request Cancel
            </Button>
          ) : null}
          {canApproveCancel && pi.status === "CANCEL_PENDING" ? (
            <>
              <Button variant="secondary" disabled={loading} onClick={handleApproveCancel}>
                <ShieldCheck className="h-4 w-4" />
                Approve Cancel
              </Button>
              <Button variant="outline" disabled={loading} onClick={handleRejectCancel}>
                <XCircle className="h-4 w-4" />
                Reject Cancel
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(pi.status)}>{formatProformaStatus(pi.status)}</Badge>
              {readyForDispatch ? (
                <Badge variant="success">Ready for Dispatch</Badge>
              ) : null}
              {dispatchToday?.active ? <Badge variant="success">Dispatch Today</Badge> : null}
              {dispatchToday?.pendingApproval ? (
                <Badge variant="warning">Dispatch Today Pending</Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PI Date</CardTitle>
          </CardHeader>
          <CardContent>{formatDocumentDate(pi.piDate)}</CardContent>
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
            <p className="text-slate-500">
              {pi.paymentSummary.requiredPaymentPercent}% Advance Required
            </p>
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

      {pi.deliveryTermNoteSnapshot ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Terms</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {pi.deliveryTermNoteSnapshot}
          </CardContent>
        </Card>
      ) : null}

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
                  <TableHead>Received in A/c</TableHead>
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
                    <TableCell>
                      {payment.receivedInAccount
                        ? formatReceivedInAccount(payment.receivedInAccount)
                        : "—"}
                    </TableCell>
                    <TableCell>{payment.referenceNo ?? "—"}</TableCell>
                    <TableCell>{payment.recordedBy.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {showRecordPayment ? (
            <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="space-y-2">
                <Label>
                  Amount <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Mode <span className="text-red-500">*</span>
                </Label>
                <select
                  required
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
                <Label>
                  Received in A/c <span className="text-red-500">*</span>
                </Label>
                <select
                  required
                  value={receivedInAccount}
                  onChange={(event) => setReceivedInAccount(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Select account</option>
                  <option value="SBI">SBI</option>
                  <option value="ICICI">ICICI</option>
                  <option value="HDFC">HDFC</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>
                  Reference <span className="text-red-500">*</span>
                </Label>
                <Input
                  required
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

      {pi.status === "BOOKED" || pi.status === "PARTIALLY_DISPATCHED" ? (
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm text-slate-600">
            <p>
              Booked on {pi.bookedAt?.slice(0, 10) ?? "—"}
              {pi.warehouse ? ` from ${pi.warehouse.name}` : ""}
              {pi.bookedBy ? ` by ${pi.bookedBy.name}` : ""}.
            </p>
            {pi.requiredDispatchMinDate ? (
              <p>
                Committed dispatch window: {formatDocumentDate(pi.requiredDispatchMinDate)}
                {pi.requiredDispatchMaxDate
                  ? ` – ${formatDocumentDate(pi.requiredDispatchMaxDate)}`
                  : ""}
              </p>
            ) : null}
            {readyForDispatch ? (
              <p className="font-medium text-emerald-700">
                Full payment received — ready for dispatch.
              </p>
            ) : (
              <p className="font-medium text-amber-700">
                Awaiting remaining payment of{" "}
                {formatCurrency(pi.paymentSummary.outstanding)} before dispatch.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showDispatchTodayCard ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispatch Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dispatchToday?.active ? (
              <p className="text-sm text-emerald-700">
                Marked for dispatch today
                {dispatchToday.markedBy ? ` by ${dispatchToday.markedBy.name}` : ""}. Warehouse can
                record the DC from Inventory → Dispatches.
              </p>
            ) : null}
            {dispatchToday?.pendingApproval ? (
              <p className="text-sm text-amber-700">
                Early dispatch today is pending sales manager / admin approval.
              </p>
            ) : null}
            {!dispatchToday?.active && !dispatchToday?.pendingApproval && dispatchToday?.needsEarlyApproval ? (
              <p className="text-sm text-amber-700">
                Committed delivery date is after {pi.daysUntilCommittedDispatch ?? "?"} day(s)
                {pi.requiredDispatchMinDate
                  ? ` (${formatDocumentDate(pi.requiredDispatchMinDate)})`
                  : ""}
                . Sales manager / admin approval is required.
              </p>
            ) : null}

            {canMarkDispatchToday && !dispatchToday?.pendingApproval ? (
              <>
                <p className="text-sm text-slate-600">
                  Optional dispatch details below are saved for warehouse and can be updated there.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vehicle No</Label>
                    <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Driver Name</Label>
                    <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Receiver Name</Label>
                    <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Receiver Mobile</Label>
                    <Input
                      value={receiverMobile}
                      onChange={(e) => setReceiverMobile(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Notes</Label>
                    <Input
                      value={dispatchNotes}
                      onChange={(e) => setDispatchNotes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={loading}
                    onClick={() => submitDispatchToday(Boolean(warning))}
                  >
                    <Truck className="h-4 w-4" />
                    {dispatchToday?.active
                      ? "Update Dispatch Details"
                      : warning
                        ? "Confirm Dispatch Today"
                        : "Dispatch Today"}
                  </Button>
                  {warning ? (
                    <Button
                      variant="outline"
                      disabled={loading}
                      onClick={() => {
                        setWarning("");
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}

            {warning ? <p className="text-sm text-amber-700">{warning}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
