"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";

export type DocGenHistoryItem = {
  id: string;
  status: string;
  generatedAt: string;
  errorMessage: string | null;
  combinedStoredPdfId: string | null;
  customerDisplayName: string | null;
  documentSet: { id: string; name: string };
  documentSetVersion: { id: string; versionNumber: number };
  generatedBy: { id: string; name: string; email: string };
  documentCount: number;
  completedDocumentCount: number;
};

type PublishedSetOption = { id: string; name: string };

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function statusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "text-emerald-700";
    case "PARTIAL":
      return "text-amber-700";
    case "FAILED":
      return "text-red-700";
    default:
      return "text-slate-600";
  }
}

export function DocGenGenerationHistory({
  initialItems,
  initialTotal,
  initialPage,
  initialPageSize,
  publishedSets,
  initialFilters,
}: {
  initialItems: DocGenHistoryItem[];
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
  publishedSets: PublishedSetOption[];
  initialFilters: {
    q?: string;
    status?: string;
    documentSetId?: string;
    fromDate?: string;
    toDate?: string;
  };
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [q, setQ] = useState(initialFilters.q ?? "");
  const [status, setStatus] = useState(initialFilters.status ?? "");
  const [documentSetId, setDocumentSetId] = useState(initialFilters.documentSetId ?? "");
  const [fromDate, setFromDate] = useState(initialFilters.fromDate ?? "");
  const [toDate, setToDate] = useState(initialFilters.toDate ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = 1) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (documentSetId) params.set("documentSetId", documentSetId);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    try {
      const response = await fetch(`/api/document-generator/generations?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Unable to load history.");
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
      setPage(body.page ?? nextPage);
      router.replace(`/documentation/document-generator/history?${params}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load history.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Generation history</h1>
          <p className="text-sm text-slate-600">
            Re-download PDFs pinned to the template and set versions used at generation time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/documentation/document-generator">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button asChild>
            <Link href="/documentation/document-generator/generate">Generate documents</Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="historyQ">Search</Label>
          <Input
            id="historyQ"
            placeholder="Customer, set, or user"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="historyStatus">Status</Label>
          <select
            id="historyStatus"
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="COMPLETED">Completed</option>
            <option value="PARTIAL">Partial</option>
            <option value="FAILED">Failed</option>
            <option value="PROCESSING">Processing</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="historySet">Document set</Label>
          <select
            id="historySet"
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={documentSetId}
            onChange={(e) => setDocumentSetId(e.target.value)}
          >
            <option value="">All sets</option>
            {publishedSets.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fromDate">From</Label>
          <Input id="fromDate" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="toDate">To</Label>
          <Input id="toDate" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={() => load(1)} disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Set / version</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Docs</th>
              <th className="px-3 py-2 font-medium">By</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No generations found.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                    {formatWhen(row.generatedAt)}
                  </td>
                  <td className="px-3 py-2">{row.customerDisplayName ?? "—"}</td>
                  <td className="px-3 py-2">
                    {row.documentSet.name}{" "}
                    <span className="text-slate-500">v{row.documentSetVersion.versionNumber}</span>
                  </td>
                  <td className={`px-3 py-2 font-medium ${statusClass(row.status)}`}>{row.status}</td>
                  <td className="px-3 py-2">
                    {row.completedDocumentCount}/{row.documentCount}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.generatedBy.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="text-emerald-700 hover:underline"
                        href={`/documentation/document-generator/history/${row.id}`}
                      >
                        Open
                      </Link>
                      {row.combinedStoredPdfId ? (
                        <a
                          className="text-emerald-700 hover:underline"
                          href={`/api/document-generator/generations/${row.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Combined PDF
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ListPaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={(next) => load(next)}
      />
    </div>
  );
}
