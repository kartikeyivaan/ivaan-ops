"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatApiErrorMessage, parseApiJson } from "@/lib/api-response";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TypeaheadSelect } from "@/components/ui/typeahead-select";
import {
  DetailField,
  formatRefundAmount,
  formatRefundDate,
} from "@/components/refunds/refund-shared";
import type { RefundFirmOption } from "@/components/refunds/refunds-list";
import {
  CUSTOMER_REFUND_REASON_LABELS,
  CUSTOMER_REFUND_REASONS,
} from "@/lib/customer-refund-constants";
import type {
  SerializedCustomerRefund,
  VerifiedRefundPayment,
} from "@/lib/customer-refund-service";

type BankTransactionOption = {
  id: string;
  bankName: string;
  bankAccountMasked: string;
  transactionReference: string | null;
  transactionDate: string;
  description: string;
  amount: number;
  isCredit: boolean;
};

type CustomerOption = { id: string; label: string };

export function RefundCreateForm({
  firms,
  customers,
}: {
  firms: RefundFirmOption[];
  customers: CustomerOption[];
}) {
  const router = useRouter();

  const [companyId, setCompanyId] = useState(firms.length === 1 ? firms[0]!.id : "");
  const [verificationCode, setVerificationCode] = useState("");
  const [verified, setVerified] = useState<VerifiedRefundPayment | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [manualCustomerId, setManualCustomerId] = useState("");
  const [piNumber, setPiNumber] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");

  const [references, setReferences] = useState<BankTransactionOption[]>([]);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);

  const [accountMode, setAccountMode] = useState<"EXISTING" | "NEW">("NEW");
  const [existingAccountId, setExistingAccountId] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const requestedAmountValue = Number(refundAmount);
  const availableRefundAmount = verified?.amounts.availableRefundAmount ?? 0;

  const amountError = useMemo(() => {
    if (!refundAmount.trim()) return "";
    if (!Number.isFinite(requestedAmountValue) || requestedAmountValue <= 0) {
      return "Refund amount must be greater than zero.";
    }
    if (requestedAmountValue > availableRefundAmount) {
      return `Refund amount cannot exceed the available refundable amount of ${formatRefundAmount(availableRefundAmount)}.`;
    }
    return "";
  }, [refundAmount, requestedAmountValue, availableRefundAmount]);

  const ifscError = useMemo(() => {
    if (accountMode !== "NEW" || !ifscCode.trim()) return "";
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.trim().toUpperCase())
      ? ""
      : "Enter a valid IFSC (e.g. HDFC0001234).";
  }, [accountMode, ifscCode]);

  const accountNumberError = useMemo(() => {
    if (accountMode !== "NEW" || !accountNumber.trim()) return "";
    return /^\d{9,18}$/.test(accountNumber.replace(/\s+/g, ""))
      ? ""
      : "Account number must be 9–18 digits.";
  }, [accountMode, accountNumber]);

  const remarksRequired = reason === "OTHER";

  const effectiveCustomerId = verified?.customerId ?? manualCustomerId;

  const canSubmit =
    Boolean(companyId) &&
    Boolean(verified) &&
    Boolean(effectiveCustomerId) &&
    Boolean(reason) &&
    (!remarksRequired || Boolean(remarks.trim())) &&
    Boolean(refundAmount.trim()) &&
    !amountError &&
    (accountMode === "EXISTING"
      ? Boolean(existingAccountId)
      : Boolean(accountHolderName.trim()) &&
        Boolean(accountNumber.trim()) &&
        Boolean(ifscCode.trim()) &&
        Boolean(bankName.trim()) &&
        !ifscError &&
        !accountNumberError);

  async function handleVerify() {
    setVerifyError("");
    setError("");
    if (!companyId) {
      setVerifyError("Select a firm first.");
      return;
    }
    if (!verificationCode.trim()) {
      setVerifyError("Enter the bank transaction verification code.");
      return;
    }

    setVerifying(true);
    try {
      const response = await fetch("/api/customer-refunds/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, verificationCode }),
      });
      const data = await parseApiJson<VerifiedRefundPayment & { message?: string }>(
        response,
      );
      if (!response.ok) {
        throw new Error(
          formatApiErrorMessage(data, "Could not verify this code."),
        );
      }

      setVerified(data);
      setPiNumber(data.piNumbers[0] ?? "");
      setManualCustomerId("");
      setReferences([]);
      // Default to reusing a saved payout account when the customer has one.
      if (data.existingRefundBankAccounts.length > 0) {
        setAccountMode("EXISTING");
        setExistingAccountId(data.existingRefundBankAccounts[0]!.id);
      } else {
        setAccountMode("NEW");
        setExistingAccountId("");
      }
    } catch (err) {
      setVerified(null);
      setVerifyError(
        err instanceof Error ? err.message : "Could not verify this code.",
      );
    } finally {
      setVerifying(false);
    }
  }

  const addReference = useCallback((option: BankTransactionOption) => {
    setReferences((previous) =>
      previous.some((row) => row.id === option.id) ? previous : [...previous, option],
    );
  }, []);

  async function handleSave(submit: boolean) {
    setError("");
    if (!verified) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/customer-refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          verificationCode,
          customerId: verified.customerId ? undefined : manualCustomerId,
          piNumber: piNumber.trim() || null,
          requestedAmount: requestedAmountValue,
          reason,
          remarks: remarks.trim() || null,
          bankTransactionIds: references.map((row) => row.id),
          refundBankAccount:
            accountMode === "EXISTING"
              ? { mode: "EXISTING", refundBankAccountId: existingAccountId }
              : {
                  mode: "NEW",
                  accountHolderName,
                  accountNumber,
                  ifscCode,
                  bankName,
                },
          submit,
        }),
      });
      const data = await parseApiJson<SerializedCustomerRefund & { message?: string }>(
        response,
      );
      if (!response.ok) {
        throw new Error(
          formatApiErrorMessage(data, "Could not create the refund request."),
        );
      }
      router.push(`/accounts/refunds/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the refund request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const linkedTotal = references.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Request Refund</h1>
        <p className="text-sm text-slate-500">
          Verify the received payment with its bank transaction verification code, then
          enter the refund details. The original payment is never changed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Original Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="firm">
                Firm <span className="text-red-600">*</span>
              </Label>
              <select
                id="firm"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={companyId}
                disabled={Boolean(verified)}
                onChange={(event) => {
                  setCompanyId(event.target.value);
                  setVerified(null);
                }}
              >
                <option value="">Select firm</option>
                {firms.map((firm) => (
                  <option key={firm.id} value={firm.id}>
                    {firm.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="verificationCode">
                Bank Transaction Verification Code{" "}
                <span className="text-red-600">*</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="verificationCode"
                  className="flex-1 font-mono uppercase"
                  value={verificationCode}
                  disabled={Boolean(verified)}
                  placeholder="e.g. P8K4X2NRDQWJ7YHB"
                  onChange={(event) =>
                    setVerificationCode(event.target.value.toUpperCase())
                  }
                />
                {verified ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setVerified(null);
                      setVerifyError("");
                    }}
                  >
                    Change
                  </Button>
                ) : (
                  <Button type="button" onClick={handleVerify} disabled={verifying}>
                    {verifying ? "Verifying…" : "Verify & Fetch Payment"}
                  </Button>
                )}
              </div>
              {verifyError ? (
                <p className="text-sm text-red-600">{verifyError}</p>
              ) : null}
            </div>
          </div>

          {verified ? (
            <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <DetailField label="Firm" value={verified.companyName} />
                <DetailField
                  label="Customer"
                  value={verified.customerName ?? "Not linked"}
                  hint={verified.customerGstNumber ?? undefined}
                />
                <DetailField
                  label="Received Amount"
                  value={formatRefundAmount(verified.receivedAmount)}
                />
                <DetailField
                  label="Payment Date"
                  value={formatRefundDate(verified.paymentDate)}
                />
                <DetailField
                  label="Bank"
                  value={`${verified.bankName} ${verified.bankAccountMasked}`}
                />
                <DetailField
                  label="Bank Reference"
                  value={verified.transactionReference ?? "—"}
                />
                <DetailField
                  label="PI Number(s)"
                  value={verified.piNumbers.join(", ") || "—"}
                />
                <DetailField
                  label="Assignment"
                  value={verified.assignmentStatus.replaceAll("_", " ")}
                />
              </div>

              {verified.payments.length > 0 ? (
                <div className="text-xs text-slate-600">
                  Linked PI payments:{" "}
                  {verified.payments
                    .map(
                      (payment) =>
                        `${payment.piNo} · ${formatRefundAmount(payment.amount)}`,
                    )
                    .join(" · ")}
                </div>
              ) : null}

              {verified.customerSource === "MANUAL_REQUIRED" ? (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-900">
                    This receipt has not been assigned to a customer yet, so the
                    customer could not be derived from payment data. Select the
                    customer being refunded.
                  </p>
                  <TypeaheadSelect
                    label="Customer *"
                    options={customers.map((customer) => ({
                      value: customer.id,
                      label: customer.label,
                    }))}
                    value={manualCustomerId}
                    onChange={setManualCustomerId}
                    placeholder="Search customer"
                    required
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {verified ? (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Bank Transaction References</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReferencePickerOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Transaction Reference
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead>Transaction Reference</TableHead>
                    <TableHead>Transaction Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {references.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-slate-500">
                        No transaction references linked yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    references.map((row) => (
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
                          <div className="text-xs text-slate-500">
                            {row.isCredit ? "Credit" : "Debit"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Remove reference"
                            onClick={() =>
                              setReferences((previous) =>
                                previous.filter((item) => item.id !== row.id),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm">
                <span className="text-slate-500">Total Linked Transactions</span>
                <span className="font-medium text-slate-900">
                  {references.length} · {formatRefundAmount(linkedTotal)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Refund Amount</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-4">
                <DetailField
                  label="Original Received Amount"
                  value={formatRefundAmount(verified.amounts.receivedAmount)}
                />
                <DetailField
                  label="Previous Completed Refunds"
                  value={formatRefundAmount(verified.amounts.previousRefundedAmount)}
                />
                <DetailField
                  label="Reserved by Open Requests"
                  value={formatRefundAmount(verified.amounts.reservedAmount)}
                />
                <DetailField
                  label="Available Refund Amount"
                  value={
                    <span className="text-emerald-700">
                      {formatRefundAmount(verified.amounts.availableRefundAmount)}
                    </span>
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="refundAmount">
                    Refund Amount <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="refundAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                  />
                  {amountError ? (
                    <p className="text-sm text-red-600">{amountError}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="piNumber">PI Number</Label>
                  <Input
                    id="piNumber"
                    value={piNumber}
                    placeholder="Reference only"
                    onChange={(event) => setPiNumber(event.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    Reference only. PI balances and payment status are not affected.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">
                    Refund Reason <span className="text-red-600">*</span>
                  </Label>
                  <select
                    id="reason"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  >
                    <option value="">Select reason</option>
                    {CUSTOMER_REFUND_REASONS.map((value) => (
                      <option key={value} value={value}>
                        {CUSTOMER_REFUND_REASON_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remarks">
                  Reason / Remarks
                  {remarksRequired ? <span className="text-red-600"> *</span> : null}
                </Label>
                <textarea
                  id="remarks"
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={remarks}
                  placeholder={
                    remarksRequired
                      ? "Required when the reason is Other"
                      : "Optional remarks"
                  }
                  onChange={(event) => setRemarks(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer Refund Bank Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {verified.existingRefundBankAccounts.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-900">
                      Existing Refund Bank Accounts
                    </span>
                    <Button
                      type="button"
                      variant={accountMode === "EXISTING" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAccountMode("EXISTING")}
                    >
                      Use Existing Account
                    </Button>
                    <Button
                      type="button"
                      variant={accountMode === "NEW" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAccountMode("NEW")}
                    >
                      Add New Account
                    </Button>
                  </div>

                  {accountMode === "EXISTING" ? (
                    <div className="space-y-2">
                      {verified.existingRefundBankAccounts.map((account) => (
                        <label
                          key={account.id}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50"
                        >
                          <input
                            type="radio"
                            name="existingRefundAccount"
                            className="mt-1"
                            checked={existingAccountId === account.id}
                            onChange={() => setExistingAccountId(account.id)}
                          />
                          <div className="text-sm">
                            <div className="font-medium text-slate-900">
                              {account.bankName} — {account.accountNumberMasked}
                            </div>
                            <div className="text-xs text-slate-500">
                              {account.accountHolderName} · {account.ifscCode}
                            </div>
                            <div className="text-xs text-slate-500">
                              Previously used: {account.usageCount} time
                              {account.usageCount === 1 ? "" : "s"}
                              {account.lastUsedAt
                                ? ` · Last used: ${formatRefundDate(account.lastUsedAt)}`
                                : ""}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No saved refund bank accounts for this customer yet. The account you
                  enter below will be saved for future refunds.
                </p>
              )}

              {accountMode === "NEW" ? (
                <div className="space-y-3">
                  <Badge variant="warning">New refund bank account</Badge>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="accountHolderName">
                        Account Holder Name <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="accountHolderName"
                        value={accountHolderName}
                        onChange={(event) => setAccountHolderName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bankName">
                        Bank Name <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="bankName"
                        value={bankName}
                        onChange={(event) => setBankName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accountNumber">
                        Account Number <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="accountNumber"
                        inputMode="numeric"
                        value={accountNumber}
                        onChange={(event) => setAccountNumber(event.target.value)}
                      />
                      {accountNumberError ? (
                        <p className="text-sm text-red-600">{accountNumberError}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ifscCode">
                        IFSC <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="ifscCode"
                        className="uppercase"
                        value={ifscCode}
                        onChange={(event) =>
                          setIfscCode(event.target.value.toUpperCase())
                        }
                      />
                      {ifscError ? (
                        <p className="text-sm text-red-600">{ifscError}</p>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Saved as an additional account for this customer. Existing accounts
                    are kept.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={() => handleSave(true)}
            >
              {submitting ? "Saving…" : "Submit for Approval"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canSubmit || submitting}
              onClick={() => handleSave(false)}
            >
              Save as Draft
            </Button>
          </div>
        </>
      ) : null}

      {referencePickerOpen && verified ? (
        <BankTransactionPicker
          companyId={companyId}
          selectedIds={references.map((row) => row.id)}
          onSelect={addReference}
          onClose={() => setReferencePickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function BankTransactionPicker({
  companyId,
  selectedIds,
  onSelect,
  onClose,
}: {
  companyId: string;
  selectedIds: string[];
  onSelect: (option: BankTransactionOption) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BankTransactionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function search() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ companyId });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(
        `/api/customer-refunds/bank-transactions?${params.toString()}`,
      );
      const data = await parseApiJson<{
        items?: BankTransactionOption[];
        message?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(
          formatApiErrorMessage(data, "Could not load bank transactions."),
        );
      }
      setItems(data.items ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load bank transactions.",
      );
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  return (
    <Modal size="2xl" onClose={onClose}>
      <ModalHeader
        title="Add Transaction Reference"
        description="Link an existing bank transaction of this firm. No new transaction is created."
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            className="flex-1"
            value={query}
            placeholder="Search by reference, description or payment code"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
          />
          <Button type="button" onClick={() => void search()} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bank</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-slate-500">
                  {searched
                    ? "No transactions found."
                    : "Search to find bank transactions."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => {
                const alreadyAdded = selectedIds.includes(row.id);
                return (
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
                      <div className="text-xs text-slate-500">
                        {row.isCredit ? "Credit" : "Debit"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={alreadyAdded}
                        onClick={() => onSelect(row)}
                      >
                        {alreadyAdded ? "Added" : "Add"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </ModalBody>
      <ModalFooter className="justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Done
        </Button>
      </ModalFooter>
    </Modal>
  );
}
