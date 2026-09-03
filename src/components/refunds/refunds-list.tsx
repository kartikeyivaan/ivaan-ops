"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatRefundAmount,
  formatRefundDate,
  RefundStatusBadge,
} from "@/components/refunds/refund-shared";
import {
  CUSTOMER_REFUND_REASON_LABELS,
  CUSTOMER_REFUND_REASONS,
  CUSTOMER_REFUND_STATUS_LABELS,
  CUSTOMER_REFUND_STATUSES,
} from "@/lib/customer-refund-constants";
import type { SerializedCustomerRefund } from "@/lib/customer-refund-service";

export type RefundFirmOption = { id: string; name: string };

type SortKey =
  | "refundNumber"
  | "customerName"
  | "requestedAmount"
  | "requestedAt"
  | "status";

export function RefundsList({
  initialRefunds,
  firms,
  canRequest,
  title = "Refunds",
  description = "Customer refunds across both firms. A refund is recorded separately and never changes the original payment.",
  emptyMessage = "No refunds found.",
}: {
  initialRefunds: SerializedCustomerRefund[];
  firms: RefundFirmOption[];
  canRequest: boolean;
  title?: string;
  description?: string;
  emptyMessage?: string;
}) {
  const [firmFilter, setFirmFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [requestedByFilter, setRequestedByFilter] = useState("");
  const [approvedByFilter, setApprovedByFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("requestedAt");
  const [sortAsc, setSortAsc] = useState(false);

  const customers = useMemo(() => {
    const map = new Map<string, string>();
    for (const refund of initialRefunds) map.set(refund.customerId, refund.customerName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [initialRefunds]);

  const requesters = useMemo(() => {
    const map = new Map<string, string>();
    for (const refund of initialRefunds) {
      map.set(refund.requestedById, refund.requestedByName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [initialRefunds]);

  const approvers = useMemo(() => {
    const names = new Set<string>();
    for (const refund of initialRefunds) {
      if (refund.approvedByName) names.add(refund.approvedByName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [initialRefunds]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const rows = initialRefunds.filter((refund) => {
      if (firmFilter && refund.companyId !== firmFilter) return false;
      if (statusFilter && refund.status !== statusFilter) return false;
      if (customerFilter && refund.customerId !== customerFilter) return false;
      if (requestedByFilter && refund.requestedById !== requestedByFilter) return false;
      if (approvedByFilter && refund.approvedByName !== approvedByFilter) return false;
      if (reasonFilter && refund.reason !== reasonFilter) return false;
      if (fromDate && refund.requestedAt.slice(0, 10) < fromDate) return false;
      if (toDate && refund.requestedAt.slice(0, 10) > toDate) return false;
      if (normalizedSearch) {
        const haystack = [
          refund.refundNumber,
          refund.customerName,
          refund.piNumber ?? "",
          refund.utrNumber ?? "",
          refund.verificationCode,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });

    const direction = sortAsc ? 1 : -1;
    return rows.sort((a, b) => {
      switch (sortKey) {
        case "requestedAmount":
          return (a.requestedAmount - b.requestedAmount) * direction;
        case "customerName":
          return a.customerName.localeCompare(b.customerName) * direction;
        case "refundNumber":
          return a.refundNumber.localeCompare(b.refundNumber) * direction;
        case "status":
          return a.statusLabel.localeCompare(b.statusLabel) * direction;
        default:
          return a.requestedAt.localeCompare(b.requestedAt) * direction;
      }
    });
  }, [
    initialRefunds,
    firmFilter,
    statusFilter,
    customerFilter,
    requestedByFilter,
    approvedByFilter,
    reasonFilter,
    fromDate,
    toDate,
    search,
    sortKey,
    sortAsc,
  ]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      requested: filtered.reduce((sum, refund) => sum + refund.requestedAmount, 0),
      refunded: filtered.reduce(
        (sum, refund) => sum + (refund.actualRefundAmount ?? 0),
        0,
      ),
    }),
    [filtered],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((previous) => !previous);
      return;
    }
    setSortKey(key);
    setSortAsc(key === "customerName" || key === "refundNumber");
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-xs">{sortAsc ? "▲" : "▼"}</span>;
  }

  function resetFilters() {
    setFirmFilter("");
    setStatusFilter("");
    setCustomerFilter("");
    setRequestedByFilter("");
    setApprovedByFilter("");
    setReasonFilter("");
    setFromDate("");
    setToDate("");
    setSearch("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {canRequest ? (
          <Button asChild>
            <Link href="/accounts/refunds/new">Request Refund</Link>
          </Button>
        ) : null}
      </div>

      <CollapsibleFilterCard title="Filters">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <label className="space-y-1 text-sm text-slate-600">
            <span>Firm</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={firmFilter}
              onChange={(event) => setFirmFilter(event.target.value)}
            >
              <option value="">All Firms</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-600">
            <span>Status</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All</option>
              {CUSTOMER_REFUND_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CUSTOMER_REFUND_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-600">
            <span>Customer</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
            >
              <option value="">All</option>
              {customers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-600">
            <span>Sales Executive</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={requestedByFilter}
              onChange={(event) => setRequestedByFilter(event.target.value)}
            >
              <option value="">All</option>
              {requesters.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-600">
            <span>Sales Manager</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={approvedByFilter}
              onChange={(event) => setApprovedByFilter(event.target.value)}
            >
              <option value="">All</option>
              {approvers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-600">
            <span>Refund Reason</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={reasonFilter}
              onChange={(event) => setReasonFilter(event.target.value)}
            >
              <option value="">All</option>
              {CUSTOMER_REFUND_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {CUSTOMER_REFUND_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-600">
            <span>Requested from</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm text-slate-600">
            <span>Requested to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm text-slate-600 md:col-span-2">
            <span>Search</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Refund number, customer, PI, UTR or verification code"
            />
          </label>
        </div>
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        </div>
      </CollapsibleFilterCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Refunds</div>
            <div className="text-xl font-semibold text-slate-900">{totals.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Requested value</div>
            <div className="text-xl font-semibold text-slate-900">
              {formatRefundAmount(totals.requested)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Actually refunded</div>
            <div className="text-xl font-semibold text-slate-900">
              {formatRefundAmount(totals.refunded)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("refundNumber")}
                >
                  Refund{sortIndicator("refundNumber")}
                </TableHead>
                <TableHead>Firm</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("customerName")}
                >
                  Customer{sortIndicator("customerName")}
                </TableHead>
                <TableHead>PI Number</TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => toggleSort("requestedAmount")}
                >
                  Refund Amount{sortIndicator("requestedAmount")}
                </TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("requestedAt")}
                >
                  Requested{sortIndicator("requestedAt")}
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("status")}
                >
                  Status{sortIndicator("status")}
                </TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead>Refund Date</TableHead>
                <TableHead>UTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-slate-500">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell className="align-top">
                      <Link
                        href={`/accounts/refunds/${refund.id}`}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {refund.refundNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">{refund.companyName}</div>
                      <div className="text-xs text-slate-500">{refund.companyCode}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">{refund.customerName}</div>
                      <div className="text-xs text-slate-500">{refund.customerCode}</div>
                    </TableCell>
                    <TableCell className="align-top">{refund.piNumber ?? "—"}</TableCell>
                    <TableCell className="align-top text-right">
                      <div className="font-medium">
                        {formatRefundAmount(refund.requestedAmount)}
                      </div>
                      {refund.actualRefundAmount !== null &&
                      refund.actualRefundAmount !== refund.requestedAmount ? (
                        <div className="text-xs text-slate-500">
                          Paid {formatRefundAmount(refund.actualRefundAmount)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">{refund.reasonLabel}</TableCell>
                    <TableCell className="align-top">{refund.requestedByName}</TableCell>
                    <TableCell className="align-top">
                      {formatRefundDate(refund.requestedAt)}
                    </TableCell>
                    <TableCell className="align-top">
                      <RefundStatusBadge
                        status={refund.status}
                        label={refund.statusLabel}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      {refund.approvedByName ?? "—"}
                    </TableCell>
                    <TableCell className="align-top">
                      {formatRefundDate(refund.refundDate)}
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs">
                      {refund.utrNumber ?? "—"}
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
