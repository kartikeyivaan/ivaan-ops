"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseApiJson } from "@/lib/api-response";
import { Badge } from "@/components/ui/badge";
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
import {
  MANAGER_SETTABLE_STATUSES,
  PURCHASE_REQUEST_STATUS_LABELS,
} from "@/lib/purchase-request-constants";
import type { SerializedPurchaseRequest } from "@/lib/purchase-request-service";
import { formatCapacityUnit } from "@/lib/products";

export function PurchaseRequestDetail({
  initialRequest,
  canManage,
  canCreateIncomingLot = false,
  isRequester,
}: {
  initialRequest: SerializedPurchaseRequest;
  canManage: boolean;
  canCreateIncomingLot?: boolean;
  isRequester: boolean;
}) {
  const router = useRouter();
  const [request, setRequest] = useState(initialRequest);
  const [status, setStatus] = useState(
    MANAGER_SETTABLE_STATUSES.includes(initialRequest.status)
      ? initialRequest.status
      : "IN_PROGRESS",
  );
  const [statusRemarks, setStatusRemarks] = useState(initialRequest.statusRemarks ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isClosed = ["FULFILLED", "REJECTED", "CANCELLED"].includes(request.status);
  const canUpdateStatus =
    !isClosed &&
    (canManage || (isRequester && request.status === "OPEN"));

  async function saveStatus(nextStatus = status) {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/purchase-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          statusRemarks: statusRemarks || null,
        }),
      });
      const data = await parseApiJson<SerializedPurchaseRequest & { message?: string }>(response);
      if (!response.ok) {
        throw new Error(data.message || "Could not update status.");
      }
      setRequest(data);
      setStatus(data.status);
      setStatusRemarks(data.statusRemarks ?? "");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/purchase/requests" className="hover:underline">
              Purchase Requests
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-slate-900">{request.requestNumber}</h1>
          <p className="text-sm text-slate-500">
            Raised by {request.requestedByName} on{" "}
            {new Date(request.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">{request.statusLabel}</Badge>
          <Badge variant={request.priority === "URGENT" ? "danger" : request.priority === "HIGH" ? "warning" : "default"}>
            {request.priorityLabel}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-slate-500">Company</div>
            <div className="font-medium">{request.companyName}</div>
          </div>
          <div>
            <div className="text-slate-500">Warehouse</div>
            <div className="font-medium">{request.warehouseName ?? "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">Remarks</div>
            <div className="font-medium">{request.remarks ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Fulfilled</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {request.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-medium">{line.productName}</div>
                    {line.remarks ? (
                      <div className="text-xs text-slate-500">{line.remarks}</div>
                    ) : null}
                    {line.lots.length > 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Lots: {line.lots.map((lot) => lot.lotNumber).join(", ")}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{line.categoryName}</TableCell>
                  <TableCell>{line.brandName}</TableCell>
                  <TableCell>
                    {line.capacity} {formatCapacityUnit(line.capacityUnit)}
                  </TableCell>
                  <TableCell>{line.requestedQty}</TableCell>
                  <TableCell>
                    {line.fulfilledQty}
                    {line.remainingQty > 0 ? (
                      <div className="text-xs text-slate-500">
                        Remaining {line.remainingQty}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{line.targetDate ?? "—"}</TableCell>
                  <TableCell>{line.priorityLabel}</TableCell>
                  <TableCell>
                    {canCreateIncomingLot &&
                    line.remainingQty > 0 &&
                    !["REJECTED", "CANCELLED", "FULFILLED"].includes(request.status) ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/purchase/incoming?prLineId=${line.id}&productId=${line.productId}&quantity=${line.remainingQty}&companyId=${request.companyId}&requestId=${request.id}${request.warehouseId ? `&warehouseId=${request.warehouseId}` : ""}`}
                        >
                          Create Incoming
                        </Link>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canUpdateStatus ? (
        <Card>
          <CardHeader>
            <CardTitle>Update status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <select
                      id="status"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as typeof status)}
                    >
                      {MANAGER_SETTABLE_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {PURCHASE_REQUEST_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="statusRemarks">Status remarks</Label>
                    <Input
                      id="statusRemarks"
                      value={statusRemarks}
                      onChange={(event) => setStatusRemarks(event.target.value)}
                      placeholder="Required for reject / cancel"
                    />
                  </div>
                </div>
                <Button type="button" disabled={loading} onClick={() => saveStatus()}>
                  {loading ? "Saving…" : "Save status"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                disabled={loading}
                onClick={() => saveStatus("CANCELLED")}
              >
                {loading ? "Cancelling…" : "Cancel request"}
              </Button>
            )}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {request.statusRemarks ? (
              <p className="text-sm text-slate-500">Last remarks: {request.statusRemarks}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
