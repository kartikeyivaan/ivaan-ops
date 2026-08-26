"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { InvoiceHandoverDetailDialog } from "@/components/accounts/invoice-handover-detail-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDocumentDate } from "@/lib/utils";

type CompletedRow = {
  id: string;
  status: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  recordedAt: string | null;
  dispatch: { dcNo: string; dispatchDate: string; proformaInvoice: { piNo: string } };
  customer: { customerName: string };
  recordedBy: { name: string } | null;
};

function matchesSearch(row: CompletedRow, query: string) {
  const haystack = [
    row.customer.customerName,
    row.dispatch.dcNo,
    row.dispatch.proformaInvoice.piNo,
    row.invoiceNumber ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function CompletedInvoicesList({ rows }: { rows: CompletedRow[] }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => matchesSearch(row, query));
  }, [rows, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Completed Invoices</h1>
          <p className="text-sm text-slate-500">Invoices already recorded from the queue.</p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/accounts/invoice-queue">
            <ArrowLeft className="h-4 w-4" />
            Back to Invoice Queue
          </Link>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, DC, PI, or invoice number…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length ? (
            filteredRows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>DC No</TableHead>
                  <TableHead>PI</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Invoice date</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-900">
                      <button
                        type="button"
                        className="cursor-pointer text-left underline-offset-2 hover:underline"
                        title="Double-click to view details"
                        onDoubleClick={() => setDetailId(row.id)}
                      >
                        {row.customer.customerName}
                      </button>
                    </TableCell>
                    <TableCell>{row.dispatch.dcNo}</TableCell>
                    <TableCell>{row.dispatch.proformaInvoice.piNo}</TableCell>
                    <TableCell>{row.invoiceNumber ?? "—"}</TableCell>
                    <TableCell>
                      {row.invoiceDate ? formatDocumentDate(row.invoiceDate) : "—"}
                    </TableCell>
                    <TableCell>
                      {row.recordedAt
                        ? new Date(row.recordedAt).toLocaleString("en-IN")
                        : "—"}
                    </TableCell>
                    <TableCell>{row.recordedBy?.name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            ) : (
              <p className="py-8 text-center text-slate-500">No matches for your search.</p>
            )
          ) : (
            <p className="py-8 text-center text-slate-500">No completed invoices.</p>
          )}
        </CardContent>
      </Card>
      {detailId ? (
        <InvoiceHandoverDetailDialog handoverId={detailId} onClose={() => setDetailId(null)} />
      ) : null}
    </div>
  );
}
