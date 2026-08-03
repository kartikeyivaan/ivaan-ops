"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatPaymentMode,
  formatReceivedInAccount,
} from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";
import { formatDocumentDate, formatPaymentDate } from "@/lib/utils";

export type InvoiceHandoverDetail = {
  id: string;
  status: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customer: { id: string; customerName: string };
  dispatch: {
    id: string;
    dcNo: string;
    dispatchDate: string;
    vehicleNo: string | null;
    driverName: string | null;
    receiverName: string | null;
    receiverMobile: string | null;
    totalAmount: number;
    lines: Array<{
      id: string;
      qty: number;
      rate: number;
      amount: number;
      product: { id: string; displayName: string };
      serials: Array<{ id: string; serialNumber: string }>;
    }>;
  };
  proformaInvoice: {
    id: string;
    piNo: string;
    totalValue: number;
    salesUser: { id: string; name: string };
    totalPaid: number;
    payments: Array<{
      id: string;
      amount: number;
      paymentDate: string;
      paymentMode: string;
      receivedInAccount: string | null;
      referenceNo: string | null;
      notes: string | null;
      recordedBy: { id: string; name: string };
    }>;
  };
};

export function InvoiceHandoverDetailDialog({
  handoverId,
  onClose,
}: {
  handoverId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceHandoverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/accounts/invoice-queue/${handoverId}`);
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.message ?? "Unable to load handover details.");
        setDetail(null);
        setLoading(false);
        return;
      }
      setDetail(data as InvoiceHandoverDetail);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [handoverId]);

  return (
    <Modal onClose={onClose} size="2xl">
      <ModalHeader
        title={detail?.customer.customerName ?? "Handover details"}
        description={
          detail
            ? `${detail.dispatch.dcNo} · PI ${detail.proformaInvoice.piNo}`
            : "Loading dispatch and payment details…"
        }
        onClose={onClose}
      />
      <ModalBody className="space-y-6">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {detail ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Sales executive" value={detail.proformaInvoice.salesUser.name} />
              <DetailField label="Vehicle" value={detail.dispatch.vehicleNo ?? "—"} />
              <DetailField label="Driver" value={detail.dispatch.driverName ?? "—"} />
              <DetailField
                label="Dispatch date"
                value={formatDocumentDate(detail.dispatch.dispatchDate)}
              />
              <DetailField
                label="PI total"
                value={formatCurrency(detail.proformaInvoice.totalValue)}
              />
              <DetailField
                label="Dispatch total"
                value={formatCurrency(detail.dispatch.totalAmount)}
              />
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-900">Products</h4>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/api/dispatches/${detail.dispatch.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="h-4 w-4" />
                    Download DC
                  </a>
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate / unit</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Serial numbers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.dispatch.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium text-slate-900">
                        {line.product.displayName}
                      </TableCell>
                      <TableCell className="text-right">{line.qty}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.rate)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.amount)}</TableCell>
                      <TableCell className="max-w-xs text-sm text-slate-600">
                        {line.serials.length
                          ? line.serials.map((serial) => serial.serialNumber).join(", ")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-900">
                  Payments recorded for PI {detail.proformaInvoice.piNo}
                </h4>
                <p className="text-sm text-slate-600">
                  Total paid {formatCurrency(detail.proformaInvoice.totalPaid)}
                </p>
              </div>
              {detail.proformaInvoice.payments.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Received in A/c</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Recorded by</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.proformaInvoice.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatPaymentDate(payment.paymentDate)}</TableCell>
                        <TableCell>{formatPaymentMode(payment.paymentMode)}</TableCell>
                        <TableCell>
                          {payment.receivedInAccount
                            ? formatReceivedInAccount(payment.receivedInAccount)
                            : "—"}
                        </TableCell>
                        <TableCell>{payment.referenceNo ?? "—"}</TableCell>
                        <TableCell>{payment.recordedBy.name}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-slate-500">No payments recorded for this PI yet.</p>
              )}
            </section>
          </>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
