"use client";

import Link from "next/link";
import { Clock, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Row = {
  id: string;
  status: string;
  ageingDays: number;
  dispatch: { dcNo: string; dispatchDate: string };
  invoiceHandover: { invoiceNumber: string | null; invoiceDate: string | null };
  customer: { customerName: string; gstNumber: string };
};

export function DocumentationList({
  rows,
  pendingInvoiceCount,
}: {
  rows: Row[];
  pendingInvoiceCount: number;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Documentation</h1>
          <p className="text-sm text-slate-500">Track invoice documentation through completion.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="h-12">
            <Link href="/documentation/pending-invoice">
              <Clock className="h-4 w-4" />
              Pending invoice{pendingInvoiceCount ? ` (${pendingInvoiceCount})` : ""}
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-12">
            <Link href="/documentation/history">
              <History className="h-4 w-4" />
              History
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const invoicePending = !row.invoiceHandover.invoiceNumber;
          return (
            <Link key={row.id} href={`/documentation/${row.id}`}>
              <Card className="h-full transition hover:border-emerald-300">
                <CardContent className="space-y-2 pt-5">
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold text-slate-900">{row.customer.customerName}</p>
                    <span className="text-sm font-medium text-emerald-700">{row.status.replaceAll("_", " ")}</span>
                  </div>
                  <p className="text-sm text-slate-600">GST {row.customer.gstNumber}</p>
                  <p className="text-sm text-slate-600">
                    {row.dispatch.dcNo} · Invoice {row.invoiceHandover.invoiceNumber ?? "—"}
                  </p>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{row.ageingDays} day ageing</span>
                    {invoicePending ? (
                      <span className="font-medium text-amber-700">Invoice pending</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {!rows.length ? <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">No open documentation records.</p> : null}
    </div>
  );
}
