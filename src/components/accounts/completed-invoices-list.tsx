"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceHandoverDetailDialog } from "@/components/accounts/invoice-handover-detail-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function CompletedInvoicesList({ rows }: { rows: CompletedRow[] }) {
  const [detailId, setDetailId] = useState<string | null>(null);

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

      <Card>
        <CardContent className="pt-6">
          {rows.length ? (
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
                {rows.map((row) => (
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
