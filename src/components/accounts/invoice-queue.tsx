"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck } from "lucide-react";
import { InvoiceHandoverDetailDialog } from "@/components/accounts/invoice-handover-detail-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QueueRow = {
  id: string;
  status: string;
  invoiceNumber: string | null;
  dispatch: { dcNo: string; dispatchDate: string; proformaInvoice: { piNo: string } };
  customer: { customerName: string };
};

export function InvoiceQueue({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  async function save() {
    if (!editing) return;
    const response = await fetch("/api/accounts/invoice-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoverId: editing, invoiceNumber, invoiceDate }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.message ?? "Unable to record invoice.");
    setEditing(null);
    setInvoiceNumber("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoice Queue</h1>
          <p className="text-sm text-slate-500">Dispatches awaiting accounts invoice recording.</p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/accounts/invoice-queue/completed">
            <FileCheck className="h-4 w-4" />
            Completed Invoices
          </Link>
        </Button>
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap justify-between gap-2 text-base">
                <span className="min-w-0">
                  <span className="text-slate-500">{row.dispatch.dcNo} · </span>
                  <button
                    type="button"
                    className="cursor-pointer font-semibold text-slate-900 underline-offset-2 hover:underline"
                    title="Double-click to view details"
                    onDoubleClick={() => setDetailId(row.id)}
                  >
                    {row.customer.customerName}
                  </button>
                </span>
                <span className="text-sm font-medium text-emerald-700">{row.status.replaceAll("_", " ")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">PI {row.dispatch.proformaInvoice.piNo} · Dispatched {new Date(row.dispatch.dispatchDate).toLocaleDateString("en-IN")}</p>
              {row.status === "PENDING_INVOICE" || row.status === "CORRECTION_REQUIRED" ? (
                editing === row.id ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1"><Label>Invoice number</Label><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></div>
                    <div className="space-y-1"><Label>Invoice date</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
                    <div className="flex items-end gap-2"><Button onClick={save}>Record invoice</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
                  </div>
                ) : <Button className="mt-3" onClick={() => { setEditing(row.id); setError(""); }}>Record invoice</Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {!rows.length ? <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">No pending invoice handovers.</p> : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {detailId ? (
        <InvoiceHandoverDetailDialog handoverId={detailId} onClose={() => setDetailId(null)} />
      ) : null}
    </div>
  );
}
