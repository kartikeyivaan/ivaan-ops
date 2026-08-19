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
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "ISSUED") return "success";
  if (status === "BOOKED") return "success";
  if (status === "PENDING_BOOKING" || status === "CANCEL_PENDING") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

export function ProformaInvoicesList({
  initialProformaInvoices,
  canManage,
}: {
  initialProformaInvoices: ProformaInvoiceListItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialProformaInvoices);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);

    const response = await fetch(`/api/proforma-invoices?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      setRows(data);
    }
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

      <CollapsibleFilterCard contentClassName="grid gap-4 md:grid-cols-4">
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
          <div className="flex items-end gap-2 md:col-span-2">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? "Loading..." : "Apply"}
            </Button>
          </div>
      </CollapsibleFilterCard>

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
                    <TableCell data-label="Total" className="text-right">{formatCurrency(row.totalValue)}</TableCell>
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
