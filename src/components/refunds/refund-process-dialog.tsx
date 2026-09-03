"use client";

import { useEffect, useMemo, useState } from "react";
import { formatApiErrorMessage, parseApiJson } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalForm,
  ModalHeader,
} from "@/components/ui/modal";
import {
  DetailField,
  formatRefundAmount,
  formatRefundDate,
} from "@/components/refunds/refund-shared";
import { CUSTOMER_REFUND_PAYMENT_MODES } from "@/lib/customer-refund-constants";
import type { SerializedCustomerRefund } from "@/lib/customer-refund-service";

type FirmBankAccount = {
  id: string;
  companyId: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  ifscCode: string | null;
  refundUsageCount: number;
  lastRefundUsedAt: string | null;
};

export function RefundProcessDialog({
  refund,
  onClose,
  onProcessed,
}: {
  refund: SerializedCustomerRefund;
  onClose: () => void;
  onProcessed: (refund: SerializedCustomerRefund) => void;
}) {
  const approvedAmount = refund.approvedAmount ?? refund.requestedAmount;

  const [accounts, setAccounts] = useState<FirmBankAccount[]>([]);
  const [accountsError, setAccountsError] = useState("");
  const [refundDate, setRefundDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [actualRefundAmount, setActualRefundAmount] = useState(String(approvedAmount));
  const [paymentMode, setPaymentMode] = useState<string>("BANK_TRANSFER");
  const [fromAccountId, setFromAccountId] = useState("");
  const [utrNumber, setUtrNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Firm bank accounts are fetched per firm, so an ISE account can never appear
  // for a PCMV refund.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(
          `/api/customer-refunds/firm-bank-accounts?companyId=${refund.companyId}`,
        );
        const data = await parseApiJson<{
          items?: FirmBankAccount[];
          message?: string;
        }>(response);
        if (!response.ok) {
          throw new Error(
            formatApiErrorMessage(data, "Could not load firm bank accounts."),
          );
        }
        if (cancelled) return;
        const items = data.items ?? [];
        setAccounts(items);
        setFromAccountId((previous) => previous || items[0]?.id || "");
      } catch (err) {
        if (cancelled) return;
        setAccountsError(
          err instanceof Error ? err.message : "Could not load firm bank accounts.",
        );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refund.companyId]);

  const amountValue = Number(actualRefundAmount);
  const amountError = useMemo(() => {
    if (!actualRefundAmount.trim()) return "";
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return "Refund amount must be greater than zero.";
    }
    if (amountValue > approvedAmount) {
      return `The executed amount cannot exceed the approved amount of ${formatRefundAmount(approvedAmount)}. Ask the Sales Manager to return the refund for correction to change it.`;
    }
    return "";
  }, [actualRefundAmount, amountValue, approvedAmount]);

  const canSubmit =
    Boolean(refundDate) &&
    Boolean(fromAccountId) &&
    Boolean(utrNumber.trim()) &&
    Boolean(actualRefundAmount.trim()) &&
    !amountError;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/customer-refunds/${refund.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundDate,
          actualRefundAmount: amountValue,
          refundPaymentMode: paymentMode,
          refundFromBankAccountId: fromAccountId,
          utrNumber,
          remarks: remarks.trim() || null,
        }),
      });
      const data = await parseApiJson<SerializedCustomerRefund & { message?: string }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiErrorMessage(data, "Could not process the refund."));
      }
      onProcessed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process the refund.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal size="lg" onClose={onClose}>
      <ModalHeader
        title="Process Refund"
        description={`${refund.refundNumber} · ${refund.customerName}`}
        onClose={onClose}
      />
      <ModalForm onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-3">
            <DetailField label="Firm" value={refund.companyName} />
            <DetailField
              label="Approved Amount"
              value={formatRefundAmount(approvedAmount)}
            />
            <DetailField
              label="Payee"
              value={refund.refundBankAccount?.accountNumberMasked ?? "—"}
              hint={refund.refundBankAccount?.bankName}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="refundDate">
                Refund Date <span className="text-red-600">*</span>
              </Label>
              <Input
                id="refundDate"
                type="date"
                required
                value={refundDate}
                onChange={(event) => setRefundDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="actualRefundAmount">
                Refund Amount <span className="text-red-600">*</span>
              </Label>
              <Input
                id="actualRefundAmount"
                type="number"
                min="0"
                step="0.01"
                required
                value={actualRefundAmount}
                onChange={(event) => setActualRefundAmount(event.target.value)}
              />
              {amountError ? (
                <p className="text-sm text-red-600">{amountError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMode">
                Payment Mode <span className="text-red-600">*</span>
              </Label>
              <select
                id="paymentMode"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value)}
              >
                {CUSTOMER_REFUND_PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromAccount">
                Refund From Bank <span className="text-red-600">*</span>
              </Label>
              <select
                id="fromAccount"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={fromAccountId}
                onChange={(event) => setFromAccountId(event.target.value)}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.bankName} {account.accountNumberMasked}
                    {account.refundUsageCount > 0
                      ? ` · used ${account.refundUsageCount}×`
                      : ""}
                  </option>
                ))}
              </select>
              {accountsError ? (
                <p className="text-sm text-red-600">{accountsError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Only {refund.companyName} accounts are listed.
                  {accounts[0]?.lastRefundUsedAt
                    ? ` Last refund from ${accounts[0].bankName} on ${formatRefundDate(accounts[0].lastRefundUsedAt)}.`
                    : ""}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="utrNumber">
                UTR / Transaction Reference <span className="text-red-600">*</span>
              </Label>
              <Input
                id="utrNumber"
                className="font-mono uppercase"
                required
                value={utrNumber}
                onChange={(event) => setUtrNumber(event.target.value.toUpperCase())}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="processRemarks">Remarks</Label>
              <textarea
                id="processRemarks"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </ModalBody>
        <ModalFooter className="justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? "Recording…" : "Mark as Refunded"}
          </Button>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}
