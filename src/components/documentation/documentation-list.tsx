"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type Row = {
  id: string;
  status: string;
  ageingDays: number;
  dispatch: { dcNo: string; dispatchDate: string };
  invoiceHandover: { invoiceNumber: string | null };
  customer: { customerName: string };
  assignedTo: { name: string } | null;
};

export function DocumentationList({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Documentation</h1>
        <p className="text-sm text-slate-500">Track invoice documentation through completion.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <Link key={row.id} href={`/documentation/${row.id}`}>
            <Card className="h-full transition hover:border-emerald-300">
              <CardContent className="space-y-2 pt-5">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-slate-900">{row.customer.customerName}</p>
                  <span className="text-sm font-medium text-emerald-700">{row.status.replaceAll("_", " ")}</span>
                </div>
                <p className="text-sm text-slate-600">{row.dispatch.dcNo} · Invoice {row.invoiceHandover.invoiceNumber ?? "—"}</p>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{row.assignedTo?.name ?? "Unassigned"}</span>
                  <span>{row.ageingDays} day ageing</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {!rows.length ? <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">No documentation records.</p> : null}
    </div>
  );
}
