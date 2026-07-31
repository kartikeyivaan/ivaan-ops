"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
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
import {
  defaultPaymentsDateRange,
  formatPaymentMode,
  formatReceivedInAccount,
} from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";
import { formatDocumentDate } from "@/lib/utils";

type PaymentRow = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
  receivedInAccount: string | null;
  referenceNo: string | null;
  notes: string | null;
  customer: {
    id: string;
    customerName: string;
    customerCode: string;
  };
  proformaInvoice: {
    id: string;
    piNo: string;
    totalValue: number;
  };
  recordedBy: { id: string; name: string };
};

type ListResponse = {
  items: PaymentRow[];
  dateFrom: string;
  dateTo: string;
  totalAmount: number;
};

export function AccountsPaymentsList() {
  const defaults = useMemo(() => defaultPaymentsDateRange(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [debouncedQ, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/accounts/payments?${queryString}`);
      const data = (await response.json()) as ListResponse & { message?: string };
      if (!response.ok) {
        setError(data.message ?? "Failed to load payments.");
        setRows([]);
        setTotalAmount(0);
        return;
      }
      setRows(data.items ?? []);
      setTotalAmount(data.totalAmount ?? 0);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setRows([]);
      setTotalAmount(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  function resetToLast30Days() {
    const range = defaultPaymentsDateRange();
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setQ("");
  }

  const exportHref = `/api/accounts/payments?${queryString}&format=xlsx`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">PI Payments</h1>
          <p className="text-sm text-slate-500">
            All payments recorded against proforma invoices. Defaults to the last 30 days.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <a href={exportHref} download>
            <Download className="h-4 w-4" />
            Download Excel
          </a>
        </Button>
      </div>

      <CollapsibleFilterCard contentClassName="grid gap-4 md:grid-cols-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="payments-q">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="payments-q"
              className="pl-9"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Customer, PI #, reference, mode, amount, notes…"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="payments-from">From date</Label>
          <Input
            id="payments-from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payments-to">To date</Label>
          <Input
            id="payments-to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-4">
          <Button type="button" variant="outline" onClick={resetToLast30Days}>
            Last 30 days
          </Button>
          <p className="text-sm text-slate-500">
            Showing {rows.length} payment{rows.length === 1 ? "" : "s"}
            {rows.length ? ` · Total ${formatCurrency(totalAmount)}` : ""}
          </p>
        </div>
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="pt-6">
          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
          {loading ? (
            <p className="py-8 text-center text-slate-500">Loading payments…</p>
          ) : rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>PI #</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Received in</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Recorded by</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDocumentDate(row.paymentDate)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/sales/customers/${row.customer.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {row.customer.customerName}
                      </Link>
                      <p className="text-xs text-slate-500">{row.customer.customerCode}</p>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/sales/proforma-invoices/${row.proformaInvoice.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {row.proformaInvoice.piNo}
                      </Link>
                      <p className="text-xs text-slate-500">
                        PI value {formatCurrency(row.proformaInvoice.totalValue)}
                      </p>
                    </TableCell>
                    <TableCell>{formatPaymentMode(row.paymentMode)}</TableCell>
                    <TableCell>
                      {row.receivedInAccount
                        ? formatReceivedInAccount(row.receivedInAccount)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[12rem] truncate" title={row.referenceNo ?? undefined}>
                        {row.referenceNo || "—"}
                      </p>
                      {row.notes ? (
                        <p className="max-w-[12rem] truncate text-xs text-slate-500" title={row.notes}>
                          {row.notes}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.recordedBy.name}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-slate-500">
              No payments found for the selected filters.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
