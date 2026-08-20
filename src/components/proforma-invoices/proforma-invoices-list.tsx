"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
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
import { formatProformaStatus, isReadyForDispatch } from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";
import { formatDocumentDate } from "@/lib/utils";

type ProformaInvoiceListItem = {
  id: string;
  piNo: string;
  status: string;
  piDate: string;
  totalValue: number;
  customer: { customerName: string; customerCode: string };
  salesUser: { name: string };
  paymentSummary: {
    totalPaid: number;
    outstanding: number;
    readyForDispatch?: boolean;
  };
  canEdit?: boolean;
  canUnbook?: boolean;
};

type SalesExecutive = { id: string; name: string; email?: string };

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "ISSUED") return "success";
  if (status === "BOOKED") return "success";
  if (status === "PENDING_BOOKING" || status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function ProformaInvoicesList({
  initialProformaInvoices,
  salesExecutives = [],
  canManage,
  canFilterByExecutive = false,
  initialFilters,
}: {
  initialProformaInvoices: ProformaInvoiceListItem[];
  salesExecutives?: SalesExecutive[];
  canManage: boolean;
  canFilterByExecutive?: boolean;
  initialFilters?: {
    q: string;
    status: string;
    fromDate: string;
    toDate: string;
    salesUserId: string;
    outstandingOnly: boolean;
  };
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialProformaInvoices);
  const [q, setQ] = useState(initialFilters?.q ?? "");
  const [status, setStatus] = useState(initialFilters?.status ?? "");
  const [fromDate, setFromDate] = useState(initialFilters?.fromDate ?? "");
  const [toDate, setToDate] = useState(initialFilters?.toDate ?? "");
  const [salesUserId, setSalesUserId] = useState(initialFilters?.salesUserId ?? "");
  const [outstandingOnly, setOutstandingOnly] = useState(
    initialFilters?.outstandingOnly ?? false,
  );
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (salesUserId) params.set("salesUserId", salesUserId);
    if (outstandingOnly) params.set("outstandingOnly", "true");

    const query = params.toString();
    router.replace(
      query ? `/sales/proforma-invoices?${query}` : "/sales/proforma-invoices",
    );

    const response = await fetch(`/api/proforma-invoices?${query}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      setRows(data);
    }
  }

  async function handleUnbook(id: string) {
    const confirmed = window.confirm(
      "Unbooking releases reserved stock so this PI can be edited. You will need to book it again after saving. Continue?",
    );
    if (!confirmed) return;
    setLoading(true);
    setActionError("");
    const response = await fetch(`/api/proforma-invoices/${id}/unbook`, { method: "POST" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setActionError(data.message ?? "Unable to unbook this PI.");
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...data } : row)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proforma Invoices</h1>
          <p className="text-sm text-slate-500">
            PI from quotations or direct entry, payments, and stock booking.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/sales/proforma-invoices/new">
              <Plus className="h-4 w-4" />
              New PI
            </Link>
          </Button>
        ) : null}
      </div>

      <CollapsibleFilterCard contentClassName="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="PI no or customer"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ISSUED">Issued</option>
            <option value="PENDING_BOOKING">Pending Booking</option>
            <option value="BOOKED">Booked</option>
            <option value="PARTIALLY_DISPATCHED">Partially Dispatched</option>
            <option value="FULLY_DISPATCHED">Fully Dispatched</option>
            <option value="CANCEL_PENDING">Cancel Pending</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fromDate">From date</Label>
          <Input
            id="fromDate"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="toDate">To date</Label>
          <Input
            id="toDate"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        {canFilterByExecutive ? (
          <div className="space-y-2">
            <Label htmlFor="salesUserId">Sales Executive</Label>
            <select
              id="salesUserId"
              value={salesUserId}
              onChange={(event) => setSalesUserId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">All</option>
              {salesExecutives.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex items-end gap-3">
          <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={outstandingOnly}
              onChange={(event) => setOutstandingOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Outstanding only
          </label>
          <Button onClick={() => void applyFilters()} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </Button>
        </div>
      </CollapsibleFilterCard>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
              <FileText className="h-10 w-10" />
              <p>No proforma invoices found.</p>
            </div>
          ) : (
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>PI No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Executive</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/sales/proforma-invoices/${row.id}`)}
                  >
                    <TableCell data-label="PI No" className="font-medium">{row.piNo}</TableCell>
                    <TableCell data-label="Customer">{row.customer.customerName}</TableCell>
                    <TableCell data-label="Executive">{row.salesUser.name}</TableCell>
                    <TableCell data-label="Date">{formatDocumentDate(row.piDate)}</TableCell>
                    <TableCell data-label="Status">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={statusVariant(row.status)}>
                          {formatProformaStatus(row.status)}
                        </Badge>
                        {(row.paymentSummary.readyForDispatch ??
                          isReadyForDispatch(row.status, row.paymentSummary.outstanding)) ? (
                          <Badge variant="success">Ready for Dispatch</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell data-label="Total" className="text-right">
                      {formatCurrency(row.totalValue)}
                    </TableCell>
                    <TableCell data-label="Outstanding" className="text-right">
                      {formatCurrency(row.paymentSummary.outstanding)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {canManage && row.canEdit ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/sales/proforma-invoices/${row.id}/edit`}>Edit</Link>
                          </Button>
                        ) : null}
                        {canManage && row.canUnbook ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={loading}
                            onClick={() => handleUnbook(row.id)}
                          >
                            Unbook
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/sales/proforma-invoices/${row.id}`}>View</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
