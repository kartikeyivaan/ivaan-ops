"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { formatApiErrorMessage, parseApiJson } from "@/lib/api-response";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DetailField,
  formatRefundAmount,
  formatRefundDate,
  formatRefundDateTime,
  RefundStatusBadge,
} from "@/components/refunds/refund-shared";
import type {
  RefundActivityEntry,
  SerializedCustomerRefund,
} from "@/lib/customer-refund-service";

type ActionKind =
  | "approve"
  | "reject"
  | "return-for-correction"
  | "cancel"
  | "submit"
  | "mark-failed";

const ACTION_LABELS: Record<ActionKind, string> = {
  approve: "Approve Refund",
  reject: "Reject Refund",
  "return-for-correction": "Return for Correction",
  cancel: "Cancel Request",
  submit: "Submit for Approval",
  "mark-failed": "Mark as Failed",
};

/** Actions that require a free-text reason before they can be sent. */
const REASON_REQUIRED: Partial<Record<ActionKind, string>> = {
  reject: "Rejection reason",
  "return-for-correction": "Correction reason",
  "mark-failed": "Failure reason",
};

export function RefundDetail({
  initialRefund,
  initialActivity,
  canApprove,
  canProcess,
  canEdit,
  canCancel,
}: {
  initialRefund: SerializedCustomerRefund;
  initialActivity: RefundActivityEntry[];
  canApprove: boolean;
  canProcess: boolean;
  canEdit: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [refund, setRefund] = useState(initialRefund);
  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [reason, setReason] = useState("");
  const [processOpen, setProcessOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDraft = refund.status === "DRAFT";
  const isPendingApproval = refund.status === "PENDING_APPROVAL";
  const isAwaitingExecution = ["APPROVED", "PROCESSING", "FAILED"].includes(
    refund.status,
  );
  const isCompleted = refund.status === "REFUNDED";

  async function runAction(kind: ActionKind) {
    const reasonLabel = REASON_REQUIRED[kind];
    if (reasonLabel && !reason.trim()) {
      setError(`${reasonLabel} is required.`);
      return;
    }

    setError("");
    setLoading(true);
    try {
      const body: Record<string, string> = {};
      if (kind === "reject") body.rejectionReason = reason.trim();
      if (kind === "return-for-correction") body.reason = reason.trim();
      if (kind === "mark-failed") body.failureReason = reason.trim();
      if (kind === "cancel" && reason.trim()) body.reason = reason.trim();
      if (kind === "approve" && reason.trim()) body.remarks = reason.trim();

      const response = await fetch(`/api/customer-refunds/${refund.id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseApiJson<SerializedCustomerRefund & { message?: string }>(
        response,
      );
      if (!response.ok) {
        throw new Error(
          formatApiErrorMessage(data, `Could not ${ACTION_LABELS[kind].toLowerCase()}.`),
        );
      }
      setRefund(data);
      setActiveAction(null);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the action.");
    } finally {
      setLoading(false);
    }
  }

  function openAction(kind: ActionKind) {
    setActiveAction(kind);
    setReason("");
    setError("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/accounts/refunds" className="hover:underline">
              Refunds
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-slate-900">{refund.refundNumber}</h1>
          <p className="text-sm text-slate-500">
            Requested by {refund.requestedByName} on{" "}
            {formatRefundDateTime(refund.requestedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefundStatusBadge status={refund.status} label={refund.statusLabel} />
          {refund.isLocked ? (
            <Badge variant="default" className="gap-1">
              <Lock className="h-3 w-3" />
              Locked after approval
            </Badge>
          ) : null}
        </div>
      </div>

      {refund.returnedForCorrectionAt && isDraft ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Returned for correction by {refund.returnedForCorrectionByName} on{" "}
          {formatRefundDateTime(refund.returnedForCorrectionAt)}:{" "}
          {refund.returnedForCorrectionReason}. This request needs re-approval after
          you update it.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Refund Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <DetailField label="Refund Number" value={refund.refundNumber} />
          <DetailField label="Status" value={refund.statusLabel} />
          <DetailField
            label="Firm"
            value={refund.companyName}
            hint={refund.companyCode}
          />
          <DetailField
            label="Customer"
            value={refund.customerName}
            hint={`${refund.customerCode} · ${refund.customerGstNumber}`}
          />
          <DetailField
            label="Refund Amount"
            value={formatRefundAmount(refund.requestedAmount)}
          />
          <DetailField
            label="Approved Amount"
            value={
              refund.approvedAmount === null
                ? "—"
                : formatRefundAmount(refund.approvedAmount)
            }
          />
          <DetailField label="Reason" value={refund.reasonLabel} />
          <DetailField
            label="PI Number"
            value={refund.piNumber ?? "—"}
            hint="Reference only"
          />
          {refund.remarks ? (
            <div className="md:col-span-4">
              <div className="text-slate-500">Remarks</div>
              <div className="font-medium text-slate-900">{refund.remarks}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Original Payment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <DetailField
            label="Verification Code"
            value={
              <span className="font-mono text-xs">{refund.verificationCode}</span>
            }
          />
          <DetailField
            label="Received Amount"
            value={formatRefundAmount(refund.originalPayment.receivedAmount)}
            hint="Unchanged by this refund"
          />
          <DetailField
            label="Payment Date"
            value={formatRefundDate(refund.originalPayment.paymentDate)}
          />
          <DetailField
            label="Bank"
            value={`${refund.originalPayment.bankName} ${refund.originalPayment.bankAccountMasked}`}
            hint={refund.originalPayment.transactionReference ?? undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank Transaction References</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>Transaction Reference</TableHead>
                <TableHead>Transaction Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refund.transactionReferences.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-slate-500">
                    No transaction references linked.
                  </TableCell>
                </TableRow>
              ) : (
                refund.transactionReferences.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.bankName}</div>
                      <div className="text-xs text-slate-500">
                        {row.bankAccountMasked}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{row.transactionReference ?? "—"}</div>
                      <div className="max-w-xs truncate text-xs text-slate-500">
                        {row.description}
                      </div>
                    </TableCell>
                    <TableCell>{formatRefundDate(row.transactionDate)}</TableCell>
                    <TableCell className="text-right">
                      {formatRefundAmount(row.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">Total Linked Transactions</span>
            <span className="font-medium text-slate-900">
              {refund.totalLinkedTransactions} ·{" "}
              {formatRefundAmount(refund.linkedTransactionsAmount)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Refund Bank Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          {refund.refundBankAccount ? (
            <>
              <DetailField
                label="Account Holder"
                value={refund.refundBankAccount.accountHolderName}
              />
              <DetailField
                label="Account Number"
                value={refund.refundBankAccount.accountNumberMasked}
              />
              <DetailField label="IFSC" value={refund.refundBankAccount.ifscCode} />
              <DetailField
                label="Bank"
                value={refund.refundBankAccount.bankName}
                hint={
                  refund.refundBankAccount.usageCount > 0
                    ? `Previously used: ${refund.refundBankAccount.usageCount} time${
                        refund.refundBankAccount.usageCount === 1 ? "" : "s"
                      }${
                        refund.refundBankAccount.lastUsedAt
                          ? ` · Last used: ${formatRefundDate(refund.refundBankAccount.lastUsedAt)}`
                          : ""
                      }`
                    : "New refund bank account"
                }
              />
            </>
          ) : (
            <p className="text-slate-500 md:col-span-4">
              No refund bank account recorded.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <DetailField label="Requested By" value={refund.requestedByName} />
          <DetailField
            label="Submitted"
            value={formatRefundDateTime(refund.submittedAt)}
          />
          <DetailField label="Approved By" value={refund.approvedByName ?? "—"} />
          <DetailField
            label="Approval Date"
            value={formatRefundDateTime(refund.approvedAt)}
          />
          {refund.rejectedByName ? (
            <>
              <DetailField label="Rejected By" value={refund.rejectedByName} />
              <DetailField
                label="Rejection Date"
                value={formatRefundDateTime(refund.rejectedAt)}
              />
              <div className="md:col-span-2">
                <div className="text-slate-500">Rejection Reason</div>
                <div className="font-medium text-slate-900">
                  {refund.rejectionReason}
                </div>
              </div>
            </>
          ) : null}
          {refund.approvalRemarks ? (
            <div className="md:col-span-4">
              <div className="text-slate-500">Approval Remarks</div>
              <div className="font-medium text-slate-900">
                {refund.approvalRemarks}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Refund Execution</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <DetailField
            label="Refund Date"
            value={formatRefundDate(refund.refundDate)}
          />
          <DetailField
            label="Refund From Bank"
            value={
              refund.refundFromBankAccount
                ? `${refund.refundFromBankAccount.bankName} ${refund.refundFromBankAccount.accountNumberMasked}`
                : "—"
            }
            hint={refund.refundFromBankAccount?.accountName}
          />
          <DetailField
            label="UTR / Reference"
            value={
              refund.utrNumber ? (
                <span className="font-mono text-xs">{refund.utrNumber}</span>
              ) : (
                "—"
              )
            }
          />
          <DetailField
            label="Actual Refund Amount"
            value={
              refund.actualRefundAmount === null
                ? "—"
                : formatRefundAmount(refund.actualRefundAmount)
            }
          />
          <DetailField label="Payment Mode" value={refund.refundPaymentMode ?? "—"} />
          <DetailField label="Processed By" value={refund.processedByName ?? "—"} />
          <DetailField
            label="Processed At"
            value={formatRefundDateTime(refund.processedAt)}
          />
          {refund.processingRemarks ? (
            <DetailField label="Remarks" value={refund.processingRemarks} />
          ) : null}
          {refund.failureReason ? (
            <div className="md:col-span-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              Failure: {refund.failureReason}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!isCompleted &&
      refund.status !== "REJECTED" &&
      refund.status !== "CANCELLED" ? (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {canEdit && isDraft ? (
                <Button type="button" onClick={() => runAction("submit")} disabled={loading}>
                  Submit for Approval
                </Button>
              ) : null}
              {canApprove && isPendingApproval ? (
                <>
                  <Button type="button" onClick={() => openAction("approve")}>
                    Approve Refund
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => openAction("reject")}
                  >
                    Reject Refund
                  </Button>
                </>
              ) : null}
              {canApprove && isAwaitingExecution && !refund.utrNumber ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openAction("return-for-correction")}
                >
                  Return for Correction
                </Button>
              ) : null}
              {canProcess && isAwaitingExecution ? (
                <>
                  <Button type="button" onClick={() => setProcessOpen(true)}>
                    Process Refund
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openAction("mark-failed")}
                  >
                    Mark as Failed
                  </Button>
                </>
              ) : null}
              {canCancel && (isDraft || isPendingApproval) ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => openAction("cancel")}
                >
                  Cancel Request
                </Button>
              ) : null}
            </div>

            {activeAction && activeAction !== "submit" ? (
              <div className="space-y-2 rounded-md border border-slate-200 p-4">
                <label
                  htmlFor="actionReason"
                  className="text-sm font-medium text-slate-900"
                >
                  {REASON_REQUIRED[activeAction] ?? "Remarks"}
                  {REASON_REQUIRED[activeAction] ? (
                    <span className="text-red-600"> *</span>
                  ) : (
                    <span className="text-slate-500"> (optional)</span>
                  )}
                </label>
                <textarea
                  id="actionReason"
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={loading}
                    onClick={() => runAction(activeAction)}
                  >
                    {loading ? "Saving…" : `Confirm ${ACTION_LABELS[activeAction]}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setActiveAction(null);
                      setReason("");
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : null}

            {refund.isLocked ? (
              <p className="text-xs text-slate-500">
                Refund amount, customer, firm, refund bank account and payment
                references are locked after approval. Use Return for Correction to
                change them; the request then needs re-approval.
              </p>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {initialActivity.length === 0 ? (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-4">
              {initialActivity.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <div className="text-sm">
                    <div className="font-medium text-slate-900">{entry.label}</div>
                    <div className="text-xs text-slate-500">
                      {entry.performedByName ?? "System"}
                      {entry.performedByRoles.length > 0
                        ? ` · ${entry.performedByRoles.join(", ")}`
                        : ""}
                      {" · "}
                      {formatRefundDateTime(entry.performedAt)}
                    </div>
                    {entry.remarks ? (
                      <div className="text-xs text-slate-600">{entry.remarks}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {processOpen ? (
        <RefundProcessDialog
          refund={refund}
          onClose={() => setProcessOpen(false)}
          onProcessed={(updated) => {
            setRefund(updated);
            setProcessOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
