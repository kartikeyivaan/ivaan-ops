"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatApiErrorMessage, parseApiJson } from "@/lib/api-response";
import { formatLetterDate } from "@/lib/utils";
import { LettersNav } from "@/components/letters/letters-nav";

export type LetterHistoryItem = {
  id: string;
  status: "DRAFT" | "ISSUED";
  letterSerialNumber: string | null;
  letterDate: string;
  signatoryName: string;
  company: { id: string; name: string; code: string };
  createdBy: { id: string; name: string; email: string };
};

export function LetterHistoryList({
  initialLetters,
  initialTotal,
  initialPage = 1,
  initialPageSize = 50,
  companies,
  initialFilters,
}: {
  initialLetters: LetterHistoryItem[];
  initialTotal: number;
  initialPage?: number;
  initialPageSize?: number;
  companies: Array<{ id: string; name: string; code: string }>;
  initialFilters: {
    q?: string;
    companyId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
  };
}) {
  const router = useRouter();
  const [letters, setLetters] = useState(initialLetters);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [q, setQ] = useState(initialFilters.q ?? "");
  const [companyId, setCompanyId] = useState(initialFilters.companyId ?? "");
  const [status, setStatus] = useState(initialFilters.status ?? "");
  const [fromDate, setFromDate] = useState(initialFilters.fromDate ?? "");
  const [toDate, setToDate] = useState(initialFilters.toDate ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextPage = 1) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (companyId) params.set("companyId", companyId);
    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    const response = await fetch(`/api/letters?${params.toString()}`);
    const payload = await parseApiJson<{
      items?: LetterHistoryItem[];
      total?: number;
      page?: number;
      message?: string;
    }>(response);
    setLoading(false);
    if (!response.ok) {
      setError(formatApiErrorMessage(payload, "Could not load letters."));
      return;
    }
    setLetters(payload.items ?? []);
    setTotal(payload.total ?? 0);
    setPage(payload.page ?? nextPage);
    router.replace(`/documents/letters?${params.toString()}`);
  }

  async function duplicate(id: string) {
    setError("");
    const response = await fetch(`/api/letters/${id}/duplicate`, { method: "POST" });
    const payload = await parseApiJson<{ id?: string; message?: string }>(response);
    if (!response.ok || !payload.id) {
      setError(formatApiErrorMessage(payload, "Could not duplicate the letter."));
      return;
    }
    router.push(`/documents/letterhead?id=${payload.id}`);
  }

  return (
    <div className="space-y-6">
      <LettersNav />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Letter History</h1>
          <p className="text-sm text-slate-500">
            Internal serial numbers stay on this screen. They are never printed on the letter.
          </p>
        </div>
        <Button asChild>
          <Link href="/documents/letterhead">New letter</Link>
        </Button>
      </div>

      <CollapsibleFilterCard>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="letter-search">Search</Label>
            <Input
              id="letter-search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Serial, signatory, or content"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-company-filter">Company</Label>
            <select
              id="letter-company-filter"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-status-filter">Status</Label>
            <select
              id="letter-status-filter"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-4 lg:col-span-2">
            <div className="space-y-1.5">
              <Label htmlFor="letter-from">From</Label>
              <Input id="letter-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="letter-to">To</Label>
              <Input id="letter-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button type="button" onClick={() => load(1)} disabled={loading}>
            Apply filters
          </Button>
        </div>
      </CollapsibleFilterCard>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardContent className="p-0">
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Serial Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Signed By</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {letters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-slate-500">
                    No letters yet.
                  </TableCell>
                </TableRow>
              ) : (
                letters.map((letter) => (
                  <TableRow key={letter.id}>
                    <TableCell className="font-medium">
                      {letter.letterSerialNumber ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={letter.status === "DRAFT" ? "warning" : "success"}>
                        {letter.status === "DRAFT" ? "Draft" : "Issued"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatLetterDate(letter.letterDate)}</TableCell>
                    <TableCell>{letter.company.code}</TableCell>
                    <TableCell>{letter.signatoryName}</TableCell>
                    <TableCell>{letter.createdBy.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {letter.status === "DRAFT" ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/documents/letterhead?id=${letter.id}`}>Edit</Link>
                          </Button>
                        ) : (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/documents/letters/${letter.id}`}>View</Link>
                          </Button>
                        )}
                        {letter.status === "ISSUED" ? (
                          <>
                            <Button asChild variant="outline" size="sm">
                              <a href={`/api/letters/${letter.id}/pdf?download=1`}>Download PDF</a>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <a href={`/api/letters/${letter.id}/print`} target="_blank" rel="noreferrer">
                                Print
                              </a>
                            </Button>
                          </>
                        ) : (
                          <Button asChild variant="outline" size="sm">
                            <a href={`/api/letters/${letter.id}/print`} target="_blank" rel="noreferrer">
                              Print
                            </a>
                          </Button>
                        )}
                        <Button type="button" variant="outline" size="sm" onClick={() => duplicate(letter.id)}>
                          Duplicate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
