"use client";

import { useEffect, useMemo, useState } from "react";
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

type BankAccountOption = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  receivedInAccount: string;
  company?: { id: string; code: string; name: string };
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
};

type UploadApiResult = {
  importId?: string;
  processingStatus?: string;
  parserType?: string;
  bankAccountId?: string | null;
  transactionsDetected?: number;
  newTransactions?: number;
  duplicatesDetected?: number;
  mismatchesDetected?: number;
  balanceIssuesDetected?: number;
  errorMessage?: string | null;
  preview?: PreviewPayload | null;
  confirmed?: boolean;
  message?: string;
  code?: string;
};

type FileRowStatus = "queued" | "processing" | "imported" | "failed";

type FileRow = {
  key: string;
  file: File;
  status: FileRowStatus;
  message: string | null;
  parserType: string | null;
  companyLabel: string | null;
  accountLabel: string | null;
  detected: number | null;
  newTransactions: number | null;
  exactMatches: number | null;
  mismatches: number | null;
};

function fileKey(file: File, index: number) {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

export function BankStatementUploadForm() {
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [overrideAccountId, setOverrideAccountId] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

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
          if (!cancelled) setMetaError(data.message ?? "Failed to load bank accounts.");
          return;
        }
        if (!cancelled) setAccounts(data.accounts ?? []);
      } catch {
        if (!cancelled) setMetaError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const imported = rows.filter((r) => r.status === "imported").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const processing = rows.filter((r) => r.status === "processing").length;
    const queued = rows.filter((r) => r.status === "queued").length;
    const newTx = rows.reduce((n, r) => n + (r.newTransactions ?? 0), 0);
    return { imported, failed, processing, queued, newTx, total: rows.length };
  }, [rows]);

  function onFilesChosen(list: FileList | null) {
    const next = list ? Array.from(list) : [];
    setFiles(next);
    setRows([]);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Choose one or more statement files to upload.");
      return;
    }
    if (showOverride && overrideAccountId && files.length > 1) {
      setError("Manual account override applies to a single file only. Upload one file, or clear the override.");
      return;
    }

    const initialRows: FileRow[] = files.map((file, index) => ({
      key: fileKey(file, index),
      file,
      status: "queued",
      message: null,
      parserType: null,
      companyLabel: null,
      accountLabel: null,
      detected: null,
      newTransactions: null,
      exactMatches: null,
      mismatches: null,
    }));
    setRows(initialRows);
    setLoading(true);
    setError(null);

    for (let i = 0; i < initialRows.length; i += 1) {
      const row = initialRows[i]!;
      setRows((prev) =>
        prev.map((r) => (r.key === row.key ? { ...r, status: "processing", message: null } : r)),
      );

      const form = new FormData();
      form.set("file", row.file);
      form.set("autoConfirm", "1");
      if (showOverride && overrideAccountId) {
        form.set("bankAccountId", overrideAccountId);
      }

      try {
        const response = await fetch("/api/banking/upload", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as UploadApiResult;

        const importedOk =
          response.ok &&
          data.confirmed === true &&
          data.processingStatus === "COMPLETED";

        if (!importedOk) {
          const failedMessage =
            data.message ?? data.errorMessage ?? "Upload or import failed for this file.";
          setRows((prev) =>
            prev.map((r) =>
              r.key === row.key
                ? {
                    ...r,
                    status: "failed",
                    message: failedMessage,
                    parserType: data.parserType ?? null,
                    companyLabel: data.preview
                      ? `${data.preview.company.name} (${data.preview.company.code})`
                      : null,
                    accountLabel: data.preview
                      ? `${data.preview.bankAccount.bankName} · ${data.preview.bankAccount.accountNumberMasked}`
                      : null,
                    detected: data.transactionsDetected ?? data.preview?.summary.detected ?? null,
                    newTransactions: data.newTransactions ?? null,
                    exactMatches: data.duplicatesDetected ?? null,
                    mismatches: data.mismatchesDetected ?? null,
                  }
                : r,
            ),
          );
          continue;
        }

        setRows((prev) =>
          prev.map((r) =>
            r.key === row.key
              ? {
                  ...r,
                  status: "imported",
                  message: data.message ?? "Imported.",
                  parserType: data.parserType ?? data.preview?.parserType ?? null,
                  companyLabel: data.preview
                    ? `${data.preview.company.name} (${data.preview.company.code})`
                    : null,
                  accountLabel: data.preview
                    ? `${data.preview.bankAccount.bankName} · ${data.preview.bankAccount.accountNumberMasked}`
                    : null,
                  detected: data.transactionsDetected ?? data.preview?.summary.detected ?? null,
                  newTransactions: data.newTransactions ?? 0,
                  exactMatches: data.duplicatesDetected ?? data.preview?.summary.exactMatches ?? null,
                  mismatches: data.mismatchesDetected ?? data.preview?.summary.mismatches ?? null,
                }
              : r,
          ),
        );
      } catch {
        setRows((prev) =>
          prev.map((r) =>
            r.key === row.key
              ? { ...r, status: "failed", message: "Could not reach the server." }
              : r,
          ),
        );
      }
    }

    setLoading(false);
    setFiles([]);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500">
          <Link href="/banking" className="text-emerald-700 hover:underline">
            Banking
          </Link>{" "}
          / Upload Statement
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Upload Statements</h1>
        <p className="text-sm text-slate-500">
          Drop multiple bank statements (any firm / bank). Each file is identified from statement
          account number, then imported automatically in sequence. Exact matches are skipped;
          mismatches are never overwritten. Original files are always deleted after analysis.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Statement files</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
            <div className="space-y-2">
              <Label htmlFor="statementFiles">Files (.xlsx, .xls, .csv, .tsv)</Label>
              <input
                id="statementFiles"
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.tsv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-800"
                onChange={(e) => onFilesChosen(e.target.files)}
                disabled={loading}
              />
              {files.length > 0 ? (
                <p className="text-xs text-slate-500">{files.length} file(s) selected</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="text-left text-sm font-medium text-emerald-800 hover:underline"
                onClick={() => setShowOverride((v) => !v)}
              >
                {showOverride ? "Hide manual account override" : "Manual account override (optional)"}
              </button>
              {showOverride ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <Label htmlFor="bankAccountId">Force bank account</Label>
                  <select
                    id="bankAccountId"
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={overrideAccountId}
                    onChange={(e) => setOverrideAccountId(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Auto-detect from statement</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.company ? `${account.company.code} · ` : ""}
                        {account.bankName} · {account.accountNumberMasked} (
                        {account.receivedInAccount})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    Use only when statement metadata cannot be mapped. Applies to a single-file
                    upload.
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <Button type="submit" disabled={loading || files.length === 0}>
                {loading ? "Importing…" : "Upload & import all"}
              </Button>
            </div>
          </form>
          {metaError ? <p className="mt-3 text-sm text-amber-700">{metaError}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Batch results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              {summary.imported} imported · {summary.failed} failed
              {summary.processing || summary.queued
                ? ` · ${summary.processing + summary.queued} pending`
                : ""}
              {" · "}
              {summary.newTx} new transaction(s) total
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Firm / account</TableHead>
                    <TableHead>Parser</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Match</TableHead>
                    <TableHead className="text-right">Mismatch</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {row.file.name}
                      </TableCell>
                      <TableCell className="capitalize">
                        <span
                          className={
                            row.status === "imported"
                              ? "text-emerald-700"
                              : row.status === "failed"
                                ? "text-red-600"
                                : "text-slate-600"
                          }
                        >
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.companyLabel || row.accountLabel ? (
                          <>
                            <div>{row.companyLabel ?? "—"}</div>
                            <div className="text-xs text-slate-500">{row.accountLabel ?? ""}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{row.parserType ?? "—"}</TableCell>
                      <TableCell className="text-right">{row.newTransactions ?? "—"}</TableCell>
                      <TableCell className="text-right">{row.exactMatches ?? "—"}</TableCell>
                      <TableCell className="text-right">{row.mismatches ?? "—"}</TableCell>
                      <TableCell className="max-w-[240px] text-xs text-slate-500">
                        {row.message ?? "—"}
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
