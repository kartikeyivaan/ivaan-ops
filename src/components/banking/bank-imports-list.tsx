"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { formatDocumentDate } from "@/lib/utils";

type ImportRow = {
  id: string;
  originalFilename: string;
  parserType: string;
  processingStatus: string;
  statementStartDate: string | null;
  statementEndDate: string | null;
  transactionsDetected: number;
  newTransactions: number;
  duplicatesDetected: number;
  mismatchesDetected: number;
  balanceIssuesDetected: number;
  errorMessage: string | null;
  uploadedAt: string;
  fileDeletedAt: string | null;
  bankAccount: {
    bankName: string;
    accountNumberMasked: string;
  } | null;
  uploadedBy: { name: string };
};

export function BankImportsList() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/banking/imports");
      const data = (await response.json()) as { items?: ImportRow[]; message?: string };
      if (!response.ok) {
        setError(data.message ?? "Failed to load import history.");
        setRows([]);
        return;
      }
      setRows(data.items ?? []);
    } catch {
      setError("Could not reach the server.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            <Link href="/banking" className="text-emerald-700 hover:underline">
              Banking
            </Link>{" "}
            / Import History
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Import History</h1>
          <p className="text-sm text-slate-500">
            Statement import metadata only — original files are never retained.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uploaded</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Parser</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Detected</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Matches</TableHead>
                <TableHead className="text-right">Mismatches</TableHead>
                <TableHead>By</TableHead>
                <TableHead>File deleted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-slate-500">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-slate-500">
                    No imports yet.{" "}
                    <Link href="/banking/upload" className="text-emerald-700 hover:underline">
                      Upload a statement
                    </Link>
                    .
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDocumentDate(row.uploadedAt)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">
                      {row.originalFilename}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.bankAccount
                        ? `${row.bankAccount.bankName} · ${row.bankAccount.accountNumberMasked}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{row.parserType}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {row.statementStartDate ?? "—"} → {row.statementEndDate ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{row.processingStatus}</div>
                      {row.errorMessage ? (
                        <div className="max-w-[160px] truncate text-xs text-red-600">
                          {row.errorMessage}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-sm">{row.transactionsDetected}</TableCell>
                    <TableCell className="text-right text-sm">{row.newTransactions}</TableCell>
                    <TableCell className="text-right text-sm">{row.duplicatesDetected}</TableCell>
                    <TableCell className="text-right text-sm">{row.mismatchesDetected}</TableCell>
                    <TableCell className="text-sm">{row.uploadedBy.name}</TableCell>
                    <TableCell className="text-sm">
                      {row.fileDeletedAt ? "Yes" : "No"}
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
