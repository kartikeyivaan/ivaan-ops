"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatQuotationStatus } from "@/lib/quotations";
import { FIRM_SALES_SCOPE, isFirmSalesScope } from "@/lib/report-permissions";
import { formatDocumentDate } from "@/lib/utils";

type QuotationListItem = {
  id: string;
  quotationNo: string;
  revisionNo: number;
  status: string;
  quotationDate: string;
  expiryDate: string;
  totalValue: number;
  customer: { customerName: string; customerCode: string };
  salesUser: { name: string };
};

type SalesExecutive = { id: string; name: string; email?: string };

type InitialFilters = {
  q?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  salesUserId?: string;
  expiry?: string;
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "SENT") return "success";
  if (status === "EXPIRED") return "danger";
  if (status === "CONVERTED") return "warning";
  return "default";
}

export function QuotationsList({
  initialQuotations,
  salesExecutives = [],
  canManage,
  canFilterByExecutive = false,
  canViewFirmWide = false,
  initialFilters,
}: {
  initialQuotations: QuotationListItem[];
  salesExecutives?: SalesExecutive[];
  canManage: boolean;
  canFilterByExecutive?: boolean;
  canViewFirmWide?: boolean;
  initialFilters?: InitialFilters;
}) {
  const router = useRouter();
  const [quotations, setQuotations] = useState(initialQuotations);
  const [q, setQ] = useState(initialFilters?.q ?? "");
  const [status, setStatus] = useState(initialFilters?.status ?? "");
  const [fromDate, setFromDate] = useState(initialFilters?.fromDate ?? "");
  const [toDate, setToDate] = useState(initialFilters?.toDate ?? "");
  const [expiry, setExpiry] = useState(initialFilters?.expiry ?? "");
  const [salesUserId, setSalesUserId] = useState(initialFilters?.salesUserId ?? "");
  const [loading, setLoading] = useState(false);
  const viewingFirmWide = canViewFirmWide && isFirmSalesScope(salesUserId);

  async function applyFilters(nextSalesUserId = salesUserId) {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (nextSalesUserId) params.set("salesUserId", nextSalesUserId);
    if (expiry) params.set("expiry", expiry);

    const query = params.toString();
    router.replace(query ? `/sales/quotations?${query}` : "/sales/quotations");

    const response = await fetch(`/api/quotations?${query}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      setQuotations(data);
    }
  }

  function toggleFirmWide() {
    const next = viewingFirmWide ? "" : FIRM_SALES_SCOPE;
    setSalesUserId(next);
    void applyFilters(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-sm text-slate-500">
            Excel-style quotation builder with 3-day validity and PDF export.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/sales/quotations/new">
              <Plus className="h-4 w-4" />
              New Quotation
            </Link>
          </Button>
        ) : null}
      </div>

      <CollapsibleFilterCard contentClassName="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Quotation no or customer"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="EXPIRED">Expired</option>
            <option value="CONVERTED">Converted</option>
          </select>
        </div>
        {canFilterByExecutive ? (
          <div className="space-y-2">
            <Label htmlFor="salesUserId">Sales Executive</Label>
            <select
              id="salesUserId"
              value={salesUserId}
              onChange={(event) => setSalesUserId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All</option>
              {salesExecutives.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="fromDate">From date</Label>
          <Input
            id="fromDate"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="toDate">To date</Label>
          <Input
            id="toDate"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expiry">Expiry</Label>
          <select
            id="expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">Any</option>
            <option value="soon">Expiring soon / expired</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {canViewFirmWide ? (
            <Button
              type="button"
              variant={viewingFirmWide ? "secondary" : "outline"}
              onClick={toggleFirmWide}
              disabled={loading}
            >
              {viewingFirmWide ? "Show my quotations only" : "See all firm quotations"}
            </Button>
          ) : null}
          <Button onClick={() => void applyFilters()} disabled={loading}>
            {loading ? "Loading..." : "Apply Filters"}
          </Button>
        </div>
      </CollapsibleFilterCard>

      {viewingFirmWide ? (
        <p className="text-sm text-slate-600">
          Showing all firm quotations so you can cover colleagues when needed.
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500">
                    No quotations found.
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((quotation) => (
                  <TableRow key={quotation.id}>
                    <TableCell className="font-medium">
                      {quotation.quotationNo}
                      {quotation.revisionNo > 1 ? ` (R${quotation.revisionNo})` : ""}
                    </TableCell>
                    <TableCell>{quotation.customer.customerName}</TableCell>
                    <TableCell>{quotation.salesUser.name}</TableCell>
                    <TableCell>{formatDocumentDate(quotation.quotationDate)}</TableCell>
                    <TableCell>{formatDocumentDate(quotation.expiryDate)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(quotation.status)}>
                        {formatQuotationStatus(quotation.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{quotation.totalValue.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/sales/quotations/${quotation.id}`)}
                      >
                        <FileText className="h-4 w-4" />
                        View
                      </Button>
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
