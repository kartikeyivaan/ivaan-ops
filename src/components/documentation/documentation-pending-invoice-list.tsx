"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDocumentDate } from "@/lib/utils";

type Row = {
  id: string;
  ageingDays: number;
  dispatch: {
    dcNo: string;
    dispatchDate: string;
    proformaInvoice: { piNo: string } | null;
  };
  customer: { customerName: string; gstNumber: string };
};

export function DocumentationPendingInvoiceList({
  rows,
  canManage,
}: {
  rows: Row[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function sendDcr(handoverId: string) {
    setError("");
    setSendingId(handoverId);
    const response = await fetch("/api/documentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoverId }),
    });
    const data = await response.json();
    setSendingId(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to send for DCR.");
      return;
    }
    router.push(`/documentation/${data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pending invoice</h1>
          <p className="text-sm text-slate-500">
            Dispatched DCs waiting on Tally invoice. Mark to send DCR to start documentation now.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/documentation">
            <ArrowLeft className="h-4 w-4" />
            Back to Documentation
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex justify-between gap-3">
                <p className="font-semibold text-slate-900">{row.customer.customerName}</p>
                <span className="text-sm font-medium text-amber-700">Invoice pending</span>
              </div>
              <p className="text-sm text-slate-600">GST {row.customer.gstNumber}</p>
              <p className="text-sm text-slate-600">
                {row.dispatch.dcNo}
                {row.dispatch.proformaInvoice?.piNo ? ` · ${row.dispatch.proformaInvoice.piNo}` : ""}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <span>Dispatched {formatDocumentDate(row.dispatch.dispatchDate)}</span>
                <span>{row.ageingDays} day ageing</span>
              </div>
              {canManage ? (
                <Button
                  className="w-full"
                  disabled={sendingId === row.id}
                  onClick={() => sendDcr(row.id)}
                >
                  {sendingId === row.id ? "Sending…" : "Send DCR"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {!rows.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">
          No dispatched records waiting on invoice.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
