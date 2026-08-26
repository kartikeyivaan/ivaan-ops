"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
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
import { defaultPaymentsDateRange } from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";

type AccountOption = {
  id: string;
  bankName: string;
  accountNumberMasked: string;
  receivedInAccount: string;
};

type TxnRow = {
  id: string;
  transactionDate: string;
  valueDate: string | null;
  description: string;
  referenceNumber: string | null;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  assignmentStatus: string;
  allocatedAmount: number;
  availableAmount: number;
  customers: Array<{ name: string; gst: string }>;
  reconciliationStatus: "OK" | "ISSUE";
  openIssueCount: number;
  bankAccount: {
    bankName: string;
    accountNumberMasked: string;
    receivedInAccount: string;
  };
};

function assignmentLabel(status: string) {
  switch (status) {
    case "UNASSIGNED":
      return "Unassigned";
    case "PARTIALLY_ASSIGNED":
      return "Partial";
    case "FULLY_ASSIGNED":
      return "Fully assigned";
    case "MANUAL_REVIEW":
      return "Manual review";
    case "NON_CUSTOMER_PAYMENT":
      return "Non-customer";
    default:
      return status;
  }
}

export function BankTransactionsList() {
  const defaults = useMemo(() => defaultPaymentsDateRange(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [bankAccountId, setBankAccountId] = useState("");
  const [direction, setDirection] = useState("ALL");
  const [assignmentStatus, setAssignmentStatus] = useState("");
  const [reconciliationStatus, setReconciliationStatus] = useState("ALL");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (bankAccountId) params.set("bankAccountId", bankAccountId);
    if (direction) params.set("direction", direction);
    if (assignmentStatus) params.set("assignmentStatus", assignmentStatus);
    if (reconciliationStatus) params.set("reconciliationStatus", reconciliationStatus);
    return params.toString();
  }, [
    debouncedQ,
    dateFrom,
    dateTo,
    bankAccountId,
    direction,
    assignmentStatus,
    reconciliationStatus,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/banking/transactions?${queryString}`);
      const data = (await response.json()) as {
        items?: TxnRow[];
        accounts?: AccountOption[];
        message?: string;
      };
      if (!response.ok) {
        setError(data.message ?? "Failed to load transactions.");
        setRows([]);
        return;
      }
      setRows(data.items ?? []);
      setAccounts(data.accounts ?? []);
    } catch {
      setError("Could not reach the server.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-slate-500">
          <Link href="/banking" className="text-emerald-700 hover:underline">
            Banking
          </Link>{" "}
          / Transactions
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Bank Transactions</h1>
        <p className="text-sm text-slate-500">
          Full debit/credit ledger for the active company. Customer and GST come from PI
          allocations.
        </p>
      </div>

      <CollapsibleFilterCard>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="q">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                id="q"
                className="pl-9"
                placeholder="Description, reference, payment code"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateFrom">From</Label>
            <Input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateTo">To</Label>
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account">Account</Label>
            <select
              id="account"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} · {account.accountNumberMasked}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="direction">Direction</Label>
            <select
              id="direction"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="ALL">All</option>
              <option value="CREDIT">Credit</option>
              <option value="DEBIT">Debit</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment">Assignment</Label>
            <select
              id="assignment"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={assignmentStatus}
              onChange={(e) => setAssignmentStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="PARTIALLY_ASSIGNED">Partially assigned</option>
              <option value="FULLY_ASSIGNED">Fully assigned</option>
              <option value="MANUAL_REVIEW">Manual review</option>
              <option value="NON_CUSTOMER_PAYMENT">Non-customer</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recon">Reconciliation</Label>
            <select
              id="recon"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={reconciliationStatus}
              onChange={(e) => setReconciliationStatus(e.target.value)}
            >
              <option value="ALL">All</option>
              <option value="OK">OK</option>
              <option value="ISSUE">Open issue</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const range = defaultPaymentsDateRange();
                setDateFrom(range.dateFrom);
                setDateTo(range.dateTo);
                setQ("");
                setBankAccountId("");
                setDirection("ALL");
                setAssignmentStatus("");
                setReconciliationStatus("ALL");
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </CollapsibleFilterCard>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[4.5rem] px-2">Date</TableHead>
                <TableHead className="min-w-[10rem] px-2">Description / Reference</TableHead>
                <TableHead className="w-[4.75rem] px-2 text-right">Debit</TableHead>
                <TableHead className="w-[4.75rem] px-2 text-right">Credit</TableHead>
                <TableHead className="w-[5.25rem] px-2 text-right">Balance</TableHead>
                <TableHead className="w-[7.5rem] px-2">Bank / Account</TableHead>
                <TableHead className="w-[5.5rem] px-2">Assignment</TableHead>
                <TableHead className="w-[8rem] px-2">Customer / GST</TableHead>
                <TableHead className="w-[4.75rem] px-2 text-right">Allocated</TableHead>
                <TableHead className="w-[4.75rem] px-2 text-right">Available</TableHead>
                <TableHead className="w-[3.75rem] px-2">Recon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-slate-500">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-slate-500">
                    No transactions for these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap px-2 py-2 align-top text-xs">
                      {row.transactionDate}
                    </TableCell>
                    <TableCell className="whitespace-normal break-words px-2 py-2 align-top text-sm">
                      <div>{row.description}</div>
                      {row.referenceNumber ? (
                        <div className="mt-0.5 font-mono text-xs text-slate-500">
                          {row.referenceNumber}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 align-top text-right text-xs">
                      {row.debitAmount ? formatCurrency(row.debitAmount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 align-top text-right text-xs">
                      {row.creditAmount ? formatCurrency(row.creditAmount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 align-top text-right text-xs">
                      {formatCurrency(row.runningBalance)}
                    </TableCell>
                    <TableCell className="whitespace-normal break-words px-2 py-2 align-top text-xs">
                      <div>{row.bankAccount.bankName}</div>
                      <div className="text-slate-500">
                        {row.bankAccount.accountNumberMasked} · {row.bankAccount.receivedInAccount}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal break-words px-2 py-2 align-top text-xs">
                      {assignmentLabel(row.assignmentStatus)}
                    </TableCell>
                    <TableCell className="whitespace-normal break-words px-2 py-2 align-top text-xs">
                      {row.customers.length === 0
                        ? "—"
                        : row.customers.map((c) => (
                            <div key={`${c.name}-${c.gst}`}>
                              <div className="font-medium text-slate-800">{c.name}</div>
                              <div className="text-slate-500">{c.gst}</div>
                            </div>
                          ))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 align-top text-right text-xs">
                      {row.creditAmount ? formatCurrency(row.allocatedAmount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 align-top text-right text-xs">
                      {row.creditAmount ? formatCurrency(row.availableAmount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 align-top text-xs">
                      {row.reconciliationStatus === "ISSUE" ? (
                        <Link
                          href="/banking/issues"
                          className="text-amber-700 hover:underline"
                        >
                          Issue ({row.openIssueCount})
                        </Link>
                      ) : (
                        "OK"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
