"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/quotations";

type BankAccountOption = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  receivedInAccount: string;
};

type PreviewPayload = {
  company: { id: string; code: string; name: string };
  bankAccount: {
    id: string;
    bankName: string;
    accountName: string;
    accountNumberMasked: string;
    receivedInAccount: string;
  };
  statementPeriod: { start: string | null; end: string | null };
  parserType: string;
  warnings: string[];
  summary: {
    detected: number;
    exactMatches: number;
    newTransactions: number;
    mismatches: number;
    balanceIssues: number;
  };
  balanceIssues: Array<{ type: string; message: string }>;
  transactions: Array<{
    classification: "EXACT_MATCH" | "MISMATCH" | "NEW";
    matchMethod: string | null;
    fieldDiffs: Array<{ field: string; existing: string | number | null; uploaded: string | number | null }>;
    incoming: {
      transactionDate: string;
      description: string;
      referenceNumber: string | null;
      debitAmount: number;
      creditAmount: number;
      runningBalance: number;
      statementSequence: number;
    };
  }>;
};

type UploadResult = {
  importId: string;
  processingStatus: string;
  parserType: string;
  bankAccountId: string | null;
  fileHash: string;
  fileDeleted: boolean;
  fileDeletedAt: string | null;
  transactionsDetected: number;
  newTransactions: number;
  duplicatesDetected: number;
  mismatchesDetected: number;
  balanceIssuesDetected: number;
  errorMessage: string | null;
  preview: PreviewPayload | null;
  message?: string;
};

function classificationLabel(value: string) {
  switch (value) {
    case "EXACT_MATCH":
      return "Exact match";
    case "MISMATCH":
      return "Mismatch";
    case "NEW":
      return "New";
    default:
      return value;
  }
}

export function BankStatementUploadForm() {
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/banking/upload");
        const data = (await response.json()) as {
          accounts?: BankAccountOption[];
          message?: string;
        };
        if (!response.ok) {
          if (!cancelled) setError(data.message ?? "Failed to load bank accounts.");
          return;
        }
        if (!cancelled) {
          setAccounts(data.accounts ?? []);
          setBankAccountId(data.accounts?.[0]?.id ?? "");
        }
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a statement file to upload.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setConfirmMessage(null);

    const form = new FormData();
    form.set("file", file);
    if (bankAccountId) form.set("bankAccountId", bankAccountId);

    try {
      const response = await fetch("/api/banking/upload", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as UploadResult & { message?: string };
      if (!response.ok && !data.importId) {
        setError(data.message ?? "Upload failed.");
        return;
      }
      setResult(data);
      if (!response.ok) {
        setError(data.message ?? data.errorMessage ?? "Analysis failed.");
      }
      setFile(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!result?.importId) return;
    setConfirming(true);
    setError(null);
    setConfirmMessage(null);
    try {
      const response = await fetch(`/api/banking/upload/${result.importId}/confirm`, {
        method: "POST",
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? "Confirm failed.");
        return;
      }
      setConfirmMessage(data.message ?? "Import confirmed.");
      setResult((prev) =>
        prev ? { ...prev, processingStatus: "COMPLETED", message: data.message } : prev,
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancel() {
    if (!result?.importId) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/banking/upload/${result.importId}/cancel`, {
        method: "POST",
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? "Cancel failed.");
        return;
      }
      setConfirmMessage(data.message ?? "Import cancelled.");
      setResult((prev) =>
        prev ? { ...prev, processingStatus: "CANCELLED", preview: null } : prev,
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setConfirming(false);
    }
  }

  const preview = result?.preview;
  const awaitingConfirm = result?.processingStatus === "PREVIEWED" && preview;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500">
          <Link href="/banking" className="text-emerald-700 hover:underline">
            Banking
          </Link>{" "}
          / Upload Statement
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Upload Statement</h1>
        <p className="text-sm text-slate-500">
          Temporary upload → import analysis → confirm new transactions only. Exact matches are
          skipped; mismatches are never overwritten. The original file is always deleted.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Statement file</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid max-w-xl gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankAccountId">Bank account (fallback)</Label>
              <select
                id="bankAccountId"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                required
              >
                {accounts.length === 0 ? (
                  <option value="">No active accounts — configure Bank Accounts first</option>
                ) : (
                  accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.bankName} · {account.accountNumberMasked} ({account.receivedInAccount})
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-slate-500">
                Preferred mapping uses statement account number metadata when present.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="statementFile">File (.xlsx, .xls, .csv, .tsv)</Label>
              <input
                id="statementFile"
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-800"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Button type="submit" disabled={loading || accounts.length === 0}>
                {loading ? "Analyzing..." : "Upload & analyze"}
              </Button>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {confirmMessage ? <p className="mt-3 text-sm text-emerald-700">{confirmMessage}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>Import analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <p>
                Entity:{" "}
                <strong>
                  {preview.company.name} ({preview.company.code})
                </strong>
              </p>
              <p>
                Bank / account:{" "}
                <strong>
                  {preview.bankAccount.bankName} · {preview.bankAccount.accountNumberMasked}
                </strong>
              </p>
              <p>
                Period:{" "}
                <strong>
                  {preview.statementPeriod.start ?? "—"} → {preview.statementPeriod.end ?? "—"}
                </strong>
              </p>
              <p>
                Parser: <strong>{preview.parserType}</strong>
              </p>
              <p>Detected: <strong>{preview.summary.detected}</strong></p>
              <p>Exact matches: <strong>{preview.summary.exactMatches}</strong></p>
              <p>New: <strong>{preview.summary.newTransactions}</strong></p>
              <p>Mismatches: <strong>{preview.summary.mismatches}</strong></p>
              <p>Balance / sequence issues: <strong>{preview.summary.balanceIssues}</strong></p>
              <p>
                Temp file deleted:{" "}
                <strong>{result?.fileDeleted ? "Yes" : "No"}</strong>
              </p>
            </div>

            {preview.balanceIssues.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                {preview.balanceIssues.map((issue, index) => (
                  <li key={`${issue.type}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}

            {preview.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-500">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}

            {awaitingConfirm ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? "Importing..." : "Import safe transactions"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={confirming}
                >
                  Cancel
                </Button>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.transactions.map((row) => (
                    <TableRow key={`${row.incoming.statementSequence}-${row.incoming.transactionDate}`}>
                      <TableCell>{row.incoming.statementSequence}</TableCell>
                      <TableCell>{row.incoming.transactionDate}</TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        {row.incoming.description}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.incoming.referenceNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.incoming.debitAmount
                          ? formatCurrency(row.incoming.debitAmount)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.incoming.creditAmount
                          ? formatCurrency(row.incoming.creditAmount)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {classificationLabel(row.classification)}
                        {row.classification === "MISMATCH" && row.fieldDiffs.length > 0 ? (
                          <span className="block text-xs text-amber-700">
                            {row.fieldDiffs.map((d) => d.field).join(", ")}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
