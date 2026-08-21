"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

type IssueRow = {
  id: string;
  issueType: string;
  status: string;
  details: { message?: string } | null;
  resolutionReason: string | null;
  createdAt: string;
  bankAccount: {
    bankName: string;
    accountNumberMasked: string;
  } | null;
  bankTransaction: {
    transactionDate: string;
    description: string;
    referenceNumber: string | null;
  } | null;
};

export function ReconciliationIssuesList() {
  const [status, setStatus] = useState("OPEN");
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const response = await fetch(`/api/banking/issues?${params}`);
      const data = (await response.json()) as { items?: IssueRow[]; message?: string };
      if (!response.ok) {
        setError(data.message ?? "Failed to load issues.");
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
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, next: "UNDER_REVIEW" | "RESOLVED" | "IGNORED" | "OPEN") {
    const reason = reasonById[id]?.trim() ?? "";
    if ((next === "IGNORED" || next === "RESOLVED") && reason.length < 3) {
      setError("Provide a reason (min 3 characters) to resolve or ignore.");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/banking/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, reason: reason || null }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? "Update failed.");
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500">
          <Link href="/banking" className="text-emerald-700 hover:underline">
            Banking
          </Link>{" "}
          / Reconciliation Issues
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Reconciliation Issues</h1>
        <p className="text-sm text-slate-500">
          Mismatches, balance breaks, and possible gaps. Ignoring requires an authorized user and a
          reason. Source bank transactions are never invented or overwritten here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="flex h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="IGNORED">Ignored</option>
            </select>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason / Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    No issues for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs font-medium">{row.issueType}</TableCell>
                    <TableCell className="text-sm">
                      {row.bankAccount
                        ? `${row.bankAccount.bankName} · ${row.bankAccount.accountNumberMasked}`
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-sm">
                      {row.bankTransaction ? (
                        <>
                          <div>{row.bankTransaction.transactionDate}</div>
                          <div className="truncate text-slate-500">
                            {row.bankTransaction.description}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-xs text-slate-600">
                      {row.details && typeof row.details === "object" && "message" in row.details
                        ? String((row.details as { message?: string }).message ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Input
                          placeholder="Reason (required to resolve/ignore)"
                          value={reasonById[row.id] ?? ""}
                          onChange={(e) =>
                            setReasonById((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row.id, "UNDER_REVIEW")}
                          >
                            Review
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row.id, "RESOLVED")}
                          >
                            Resolve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row.id, "IGNORED")}
                          >
                            Ignore
                          </Button>
                        </div>
                      </div>
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
