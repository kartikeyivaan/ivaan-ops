"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import {
  PURCHASE_REQUEST_PRIORITIES,
  PURCHASE_REQUEST_PRIORITY_LABELS,
  PURCHASE_REQUEST_STATUS_LABELS,
  PURCHASE_REQUEST_STATUSES,
} from "@/lib/purchase-request-constants";
import type { SerializedPurchaseRequest } from "@/lib/purchase-request-service";
import { formatCapacityUnit } from "@/lib/products";

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "FULFILLED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "ORDERED" || status === "PARTIALLY_FULFILLED" || status === "IN_PROGRESS") {
    return "warning";
  }
  return "default";
}

function priorityVariant(priority: string): "default" | "success" | "warning" | "danger" {
  if (priority === "URGENT") return "danger";
  if (priority === "HIGH") return "warning";
  return "default";
}

export function PurchaseRequestsList({
  initialRequests,
  canRaise,
}: {
  initialRequests: SerializedPurchaseRequest[];
  canRaise: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    for (const request of initialRequests) {
      map.set(request.companyId, request.companyName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [initialRequests]);

  const filtered = useMemo(() => {
    return initialRequests.filter((request) => {
      if (statusFilter && request.status !== statusFilter) return false;
      if (priorityFilter && request.priority !== priorityFilter) return false;
      if (companyFilter && request.companyId !== companyFilter) return false;
      return true;
    });
  }, [initialRequests, statusFilter, priorityFilter, companyFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Requests</h1>
          <p className="text-sm text-slate-500">
            Raise demand for items to purchase across companies. Projects Managers and Super Admins
            can view and update all requests.
          </p>
        </div>
        {canRaise ? (
          <Button asChild>
            <Link href="/purchase/requests/new">Raise Purchase Request</Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {companies.length > 1 ? (
          <label className="text-sm text-slate-600">
            Company
            <select
              className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
            >
              <option value="">All</option>
              {companies.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm text-slate-600">
          Status
          <select
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All</option>
            {PURCHASE_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PURCHASE_REQUEST_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Priority
          <select
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="">All</option>
            {PURCHASE_REQUEST_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PURCHASE_REQUEST_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Raised by</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                    No purchase requests found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="align-top">
                      <Link
                        href={`/purchase/requests/${request.id}`}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {request.requestNumber}
                      </Link>
                      {request.warehouseName ? (
                        <div className="text-xs text-slate-500">{request.warehouseName}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">{request.companyName}</div>
                      <div className="text-xs text-slate-500">{request.companyCode}</div>
                    </TableCell>
                    <TableCell className="align-top">{request.requestedByName}</TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-2">
                        {request.lines.map((line) => (
                          <div key={line.id} className="text-sm">
                            <div className="font-medium text-slate-900">{line.productName}</div>
                            <div className="text-xs text-slate-500">
                              {line.brandName} · {line.categoryName} ·{" "}
                              {line.capacity} {formatCapacityUnit(line.capacityUnit)}
                            </div>
                            <div className="text-xs text-slate-600">
                              Qty {line.requestedQty}
                              {line.fulfilledQty > 0
                                ? ` · Fulfilled ${line.fulfilledQty}`
                                : ""}
                              {line.targetDate ? ` · Target ${line.targetDate}` : ""}
                              {line.priority !== request.priority
                                ? ` · ${line.priorityLabel}`
                                : ""}
                            </div>
                            {line.remarks ? (
                              <div className="text-xs text-slate-500">{line.remarks}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={priorityVariant(request.priority)}>
                        {request.priorityLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={statusVariant(request.status)}>{request.statusLabel}</Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      {new Date(request.createdAt).toLocaleDateString("en-IN")}
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
