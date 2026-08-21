"use client";

import { useEffect, useState } from "react";
import type { BankAccountRow } from "@/components/banking/bank-accounts-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";

const RECEIVED_OPTIONS = ["SBI", "HDFC", "ICICI"] as const;

export function BankAccountEditDialog({
  account,
  onClose,
  onSaved,
}: {
  account: BankAccountRow;
  onClose: () => void;
  onSaved: (account: BankAccountRow) => void;
}) {
  const [bankName, setBankName] = useState(account.bankName);
  const [accountName, setAccountName] = useState(account.accountName);
  const [accountNumber, setAccountNumber] = useState(account.accountNumber);
  const [ifscCode, setIfscCode] = useState(account.ifscCode ?? "");
  const [receivedInAccount, setReceivedInAccount] = useState(account.receivedInAccount);
  const [isActive, setIsActive] = useState(account.isActive);
  const [visibleToSales, setVisibleToSales] = useState(account.visibleToSales);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBankName(account.bankName);
    setAccountName(account.accountName);
    setAccountNumber(account.accountNumber);
    setIfscCode(account.ifscCode ?? "");
    setReceivedInAccount(account.receivedInAccount);
    setIsActive(account.isActive);
    setVisibleToSales(account.visibleToSales);
    setError(null);
  }, [account]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch(`/api/banking/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankName,
        accountName,
        accountNumber,
        ifscCode: ifscCode || null,
        receivedInAccount,
        isActive,
        visibleToSales,
      }),
    });
    const data = (await response.json()) as BankAccountRow & { message?: string };
    setSaving(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to update bank account.");
      return;
    }

    onSaved(data);
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="Edit bank account" onClose={onClose} />
      <ModalForm onSubmit={handleSave}>
        <ModalBody className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="editBankName">Bank</Label>
            <Input
              id="editBankName"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editAccountName">Account name</Label>
            <Input
              id="editAccountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editAccountNumber">Account number</Label>
            <Input
              id="editAccountNumber"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              required
            />
            <p className="text-xs text-slate-500">
              Shown masked in lists; full number is used to map statement uploads.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="editIfsc">IFSC</Label>
            <Input
              id="editIfsc"
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editReceived">Received in (PI)</Label>
            <select
              id="editReceived"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={receivedInAccount}
              onChange={(e) =>
                setReceivedInAccount(e.target.value as (typeof RECEIVED_OPTIONS)[number])
              }
            >
              {RECEIVED_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="editStatus">Status</Label>
            <select
              id="editStatus"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={isActive ? "active" : "inactive"}
              onChange={(e) => setIsActive(e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="editVisibleToSales">Visible to Sales</Label>
            <select
              id="editVisibleToSales"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={visibleToSales ? "yes" : "no"}
              onChange={(e) => setVisibleToSales(e.target.value === "yes")}
            >
              <option value="yes">Yes — show in Daily Receipts</option>
              <option value="no">No — hide from Sales</option>
            </select>
            <p className="text-xs text-slate-500">
              Controls whether credit receipts from this account appear for Sales Executives.
            </p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}
