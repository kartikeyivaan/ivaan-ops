"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BankAccountEditDialog } from "@/components/banking/bank-account-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type BankAccountRow = {
  id: string;
  companyId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountNumberMasked: string;
  ifscCode: string | null;
  currency: string;
  receivedInAccount: "SBI" | "ICICI" | "HDFC";
  isActive: boolean;
  visibleToSales: boolean;
  createdAt: string;
  updatedAt: string;
  company?: { id: string; code: string; name: string };
};

type Company = { id: string; code: string; name: string };

const RECEIVED_OPTIONS = ["SBI", "HDFC", "ICICI"] as const;

export function BankAccountsManager({
  company,
  initialAccounts,
}: {
  company: Company;
  initialAccounts: BankAccountRow[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [editing, setEditing] = useState<BankAccountRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState(company.name);
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [receivedInAccount, setReceivedInAccount] =
    useState<(typeof RECEIVED_OPTIONS)[number]>("SBI");
  const [visibleToSales, setVisibleToSales] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  useEffect(() => {
    setAccountName(company.name);
  }, [company.id, company.name]);

  const sorted = useMemo(
    () =>
      [...accounts].sort((a, b) =>
        `${a.bankName}${a.accountName}`.localeCompare(`${b.bankName}${b.accountName}`),
      ),
    [accounts],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/banking/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: company.id,
        bankName,
        accountName,
        accountNumber,
        ifscCode: ifscCode || null,
        receivedInAccount,
        currency: "INR",
        isActive: true,
        visibleToSales,
      }),
    });
    const data = (await response.json()) as BankAccountRow & { message?: string };
    setCreating(false);

    if (!response.ok) {
      setError(data.message ?? "Failed to create bank account.");
      return;
    }

    setAccounts((prev) => [...prev, data]);
    setMessage("Bank account created.");
    setBankName("");
    setAccountNumber("");
    setIfscCode("");
    setVisibleToSales(true);
    router.refresh();
  }

  async function toggleVisibleToSales(account: BankAccountRow) {
    setTogglingId(account.id);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/banking/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibleToSales: !account.visibleToSales }),
    });
    const data = (await response.json()) as BankAccountRow & { message?: string };
    setTogglingId(null);
    if (!response.ok) {
      setError(data.message ?? "Failed to update Sales visibility.");
      return;
    }
    setAccounts((prev) => prev.map((row) => (row.id === data.id ? data : row)));
    setMessage(
      data.visibleToSales
        ? `${data.bankName} is now visible to Sales.`
        : `${data.bankName} is hidden from Sales.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            <Link href="/banking" className="text-emerald-700 hover:underline">
              Banking
            </Link>{" "}
            / Bank Accounts
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Bank Accounts</h1>
          <p className="text-sm text-slate-500">
            Master accounts for {company.name} ({company.code}). Statement imports map by
            account number. Use <span className="font-medium">Visible to Sales</span> to
            control which accounts appear in Daily Receipts.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add bank account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank</Label>
              <Input
                id="bankName"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="State Bank of India"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountName">Account name</Label>
              <Input
                id="accountName"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account number</Label>
              <Input
                id="accountNumber"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ifscCode">IFSC</Label>
              <Input
                id="ifscCode"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receivedInAccount">Received in (PI)</Label>
              <select
                id="receivedInAccount"
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
              <Label htmlFor="visibleToSales">Visible to Sales</Label>
              <select
                id="visibleToSales"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={visibleToSales ? "yes" : "no"}
                onChange={(e) => setVisibleToSales(e.target.value === "yes")}
              >
                <option value="yes">Yes — show in Daily Receipts</option>
                <option value="no">No — hide from Sales</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating}>
                {creating ? "Saving..." : "Add account"}
              </Button>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>Account name</TableHead>
                <TableHead>Account no.</TableHead>
                <TableHead>IFSC</TableHead>
                <TableHead>PI mapping</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visible to Sales</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500">
                    No bank accounts for this company yet. Run seed or add one above.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>{account.bankName}</TableCell>
                    <TableCell>{account.accountName}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {account.accountNumberMasked}
                    </TableCell>
                    <TableCell>{account.ifscCode ?? "—"}</TableCell>
                    <TableCell>{account.receivedInAccount}</TableCell>
                    <TableCell>
                      <Badge variant={account.isActive ? "success" : "default"}>
                        {account.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={togglingId === account.id || !account.isActive}
                        onClick={() => void toggleVisibleToSales(account)}
                        title={
                          account.isActive
                            ? "Toggle Sales Daily Receipts visibility"
                            : "Activate the account before showing it to Sales"
                        }
                      >
                        {togglingId === account.id
                          ? "…"
                          : account.visibleToSales
                            ? "Shown"
                            : "Hidden"}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(account)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing ? (
        <BankAccountEditDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setAccounts((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
            setEditing(null);
            setMessage("Bank account updated.");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
