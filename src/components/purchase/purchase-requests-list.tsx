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

  const filtered = useMemo(() => {
    return initialRequests.filter((request) => {
      if (statusFilter && request.status !== statusFilter) return false;
      if (priorityFilter && request.priority !== priorityFilter) return false;
      return true;
    });
  }, [initialRequests, statusFilter, priorityFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Requests</h1>
          <p className="text-sm text-slate-500">
            Raise demand for items to purchase. Purchase can update status and create incoming lots.
          </p>
        </div>
        {canRaise ? (
          <Button asChild>
            <Link href="/purchase/requests/new">Raise Purchase Request</Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
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
                <TableHead>Raised by</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    No purchase requests found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
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
                    <TableCell>{request.requestedByName}</TableCell>
                    <TableCell>{request.lineCount}</TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(request.priority)}>
                        {request.priorityLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(request.status)}>{request.statusLabel}</Badge>
                    </TableCell>
                    <TableCell>
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
