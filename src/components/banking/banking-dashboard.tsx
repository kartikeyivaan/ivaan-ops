"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/quotations";
import { formatDocumentDate } from "@/lib/utils";

type DashboardData = {
  asOf: string;
  totalBalance: number;
  iseTotalBalance: number;
  pcmTotalBalance: number;
  accountBalances: Array<{
    bankAccountId: string;
    bankName: string;
    accountNumberMasked: string;
    balance: number;
    asOf: string;
  }>;
  unassignedCreditAmount: number;
  partiallyAssignedCreditAmount: number;
  unverifiedManualPayments: number;
  openReconciliationIssues: number;
  recentImports: Array<{
    id: string;
    originalFilename: string;
    processingStatus: string;
    uploadedAt: string;
    newTransactions: number;
  }>;
  lastImport: {
    processingStatus: string;
    originalFilename: string;
    uploadedAt: string;
    errorMessage: string | null;
  } | null;
};

const NAV = [
  { href: "/banking/transactions", title: "Transactions", description: "Full debit/credit ledger" },
  { href: "/banking/upload", title: "Upload Statement", description: "Temporary import + preview" },
  { href: "/banking/issues", title: "Reconciliation Issues", description: "Mismatches and gaps" },
  { href: "/banking/accounts", title: "Bank Accounts", description: "Account master" },
  { href: "/banking/imports", title: "Import History", description: "Past uploads metadata" },
  {
    href: "/sales/daily-receipts",
    title: "Daily Receipts",
    description: "Sales credit view with copyable payment codes",
  },
] as const;

export function BankingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/banking/dashboard");
      const json = (await response.json()) as DashboardData & { message?: string };
      if (!response.ok) {
        setError(json.message ?? "Failed to load dashboard.");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Could not reach the server.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Banking</h1>
        <p className="text-sm text-slate-500">
          Bank transactions, statement import, and PI payment reconciliation
          {data ? ` · as of ${data.asOf}` : ""}.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Latest total balance"
          subtitle="Active company accounts"
          value={loading ? "…" : formatCurrency(data?.totalBalance ?? 0)}
        />
        <MetricCard
          title="ISE total balance"
          value={loading ? "…" : formatCurrency(data?.iseTotalBalance ?? 0)}
        />
        <MetricCard
          title="PCM total balance"
          value={loading ? "…" : formatCurrency(data?.pcmTotalBalance ?? 0)}
        />
        <MetricCard
          title="Unassigned credit"
          value={loading ? "…" : formatCurrency(data?.unassignedCreditAmount ?? 0)}
          href="/sales/daily-receipts"
        />
        <MetricCard
          title="Partially assigned credit"
          value={loading ? "…" : formatCurrency(data?.partiallyAssignedCreditAmount ?? 0)}
          href="/sales/daily-receipts"
        />
        <MetricCard
          title="Unverified manual PI payments"
          value={loading ? "…" : String(data?.unverifiedManualPayments ?? 0)}
        />
        <MetricCard
          title="Open reconciliation issues"
          value={loading ? "…" : String(data?.openReconciliationIssues ?? 0)}
          href="/banking/issues"
        />
        <MetricCard
          title="Last import status"
          subtitle={
            loading
              ? undefined
              : data?.lastImport
                ? data.lastImport.originalFilename
                : "No imports yet"
          }
          value={
            loading
              ? "…"
              : data?.lastImport
                ? data.lastImport.processingStatus
                : "None"
          }
          href="/banking/imports"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account balances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {loading ? (
              <p className="text-slate-500">Loading…</p>
            ) : !data?.accountBalances.length ? (
              <p className="text-slate-500">
                No active bank accounts.{" "}
                <Link href="/banking/accounts" className="text-emerald-700 hover:underline">
                  Configure accounts
                </Link>
                .
              </p>
            ) : (
              data.accountBalances.map((account) => (
                <div
                  key={account.bankAccountId}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"
                >
                  <div>
                    <div className="font-medium text-slate-800">{account.bankName}</div>
                    <div className="text-xs text-slate-500">
                      {account.accountNumberMasked} · as of {account.asOf}
                    </div>
                  </div>
                  <div className="font-medium">{formatCurrency(account.balance)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent uploads</CardTitle>
            <Link href="/banking/imports" className="text-xs text-emerald-700 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {loading ? (
              <p className="text-slate-500">Loading…</p>
            ) : !data?.recentImports.length ? (
              <p className="text-slate-500">
                No uploads yet.{" "}
                <Link href="/banking/upload" className="text-emerald-700 hover:underline">
                  Upload a statement
                </Link>
                .
              </p>
            ) : (
              data.recentImports.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {row.originalFilename}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDocumentDate(row.uploadedAt)} · {row.processingStatus}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-slate-600">+{row.newTransactions} new</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {NAV.map((link) => (
          <Card key={link.href}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Link href={link.href} className="text-emerald-800 hover:underline">
                  {link.title}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">{link.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  href,
}: {
  title: string;
  value: string;
  subtitle?: string;
  href?: string;
}) {
  const body = (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        {subtitle ? <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p> : null}
      </CardContent>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-90">
        <Card>{body}</Card>
      </Link>
    );
  }

  return <Card>{body}</Card>;
}
