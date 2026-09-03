"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { RefundProcessDialog } from "@/components/refunds/refund-process-dialog";
import {
  formatRefundAmount,
  formatRefundDate,
  RefundStatusBadge,
} from "@/components/refunds/refund-shared";
import type { RefundFirmOption } from "@/components/refunds/refunds-list";
import type { SerializedCustomerRefund } from "@/lib/customer-refund-service";

export function RefundExecutionQueue({
  initialRefunds,
  firms,
}: {
  initialRefunds: SerializedCustomerRefund[];
  firms: RefundFirmOption[];
}) {
  const [refunds, setRefunds] = useState(initialRefunds);
  const [firmFilter, setFirmFilter] = useState("");
  const [processing, setProcessing] = useState<SerializedCustomerRefund | null>(null);

  const filtered = useMemo(
    () =>
      firmFilter ? refunds.filter((refund) => refund.companyId === firmFilter) : refunds,
    [refunds, firmFilter],
  );

  const totalApproved = filtered.reduce(
    (sum, refund) => sum + (refund.approvedAmount ?? refund.requestedAmount),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pending Execution</h1>
          <p className="text-sm text-slate-500">
            Approved refunds awaiting transfer. Recording the transfer does not change
            the original payment or bank transaction.
          </p>
        </div>
        <label className="text-sm text-slate-600">
          Firm
          <select
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={firmFilter}
            onChange={(event) => setFirmFilter(event.target.value)}
          >
            <option value="">All Firms</option>
            {firms.map((firm) => (
              <option key={firm.id} value={firm.id}>
                {firm.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Refunds pending</div>
            <div className="text-xl font-semibold text-slate-900">
              {filtered.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Approved value</div>
            <div className="text-xl font-semibold text-slate-900">
              {formatRefundAmount(totalApproved)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Refund</TableHead>
                <TableHead>Firm</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Refund Amount</TableHead>
                <TableHead>PI Number</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Original Payment</TableHead>
                <TableHead>Transaction References</TableHead>
                <TableHead>Refund Bank Account</TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-slate-500">
                    No refunds are pending execution.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell className="align-top">
                      <Link
                        href={`/accounts/refunds/${refund.id}`}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {refund.refundNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">{refund.companyName}</div>
                      <div className="text-xs text-slate-500">{refund.companyCode}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">{refund.customerName}</div>
                      <div className="text-xs text-slate-500">{refund.customerCode}</div>
                    </TableCell>
                    <TableCell className="align-top text-right font-medium">
                      {formatRefundAmount(
                        refund.approvedAmount ?? refund.requestedAmount,
                      )}
                    </TableCell>
                    <TableCell className="align-top">{refund.piNumber ?? "—"}</TableCell>
                    <TableCell className="align-top">{refund.reasonLabel}</TableCell>
                    <TableCell className="align-top">
                      <div className="font-mono text-xs">{refund.verificationCode}</div>
                      <div className="text-xs text-slate-500">
                        {formatRefundAmount(refund.originalPayment.receivedAmount)} ·{" "}
                        {formatRefundDate(refund.originalPayment.paymentDate)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {refund.totalLinkedTransactions === 0 ? (
                        "—"
                      ) : (
                        <div className="text-xs text-slate-600">
                          {refund.totalLinkedTransactions} linked ·{" "}
                          {formatRefundAmount(refund.linkedTransactionsAmount)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {refund.refundBankAccount ? (
                        <>
                          <div className="font-medium">
                            {refund.refundBankAccount.bankName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {refund.refundBankAccount.accountNumberMasked} ·{" "}
                            {refund.refundBankAccount.ifscCode}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div>{refund.approvedByName ?? "—"}</div>
                      <div className="text-xs text-slate-500">
                        {formatRefundDate(refund.approvedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <RefundStatusBadge
                        status={refund.status}
                        label={refund.statusLabel}
                      />
                      {refund.failureReason ? (
                        <div className="text-xs text-red-600">
                          {refund.failureReason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setProcessing(refund)}
                      >
                        Process Refund
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {processing ? (
        <RefundProcessDialog
          refund={processing}
          onClose={() => setProcessing(null)}
          onProcessed={(updated) => {
            setRefunds((previous) =>
              previous.filter((refund) => refund.id !== updated.id),
            );
            setProcessing(null);
          }}
        />
      ) : null}
    </div>
  );
}
