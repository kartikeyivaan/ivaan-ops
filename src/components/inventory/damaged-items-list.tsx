"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, XCircle } from "lucide-react";
import type { DamageReportRecord } from "@/lib/damage-report-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

type StatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "danger";
    case "REJECTED":
      return "default";
    default:
      return "default";
  }
}

export function DamagedItemsList({
  initialItems,
  canCreate,
  canApprove,
}: {
  initialItems: DamageReportRecord[];
  canCreate: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState(initialItems);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<DamageReportRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DamageReportRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function applyFilter(nextStatus: StatusFilter) {
    setStatus(nextStatus);
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    const response = await fetch(`/api/inventory/damage-reports?${params.toString()}`);
    setLoading(false);
    if (!response.ok) {
      setError("Unable to load damaged items.");
      return;
    }
    setItems(await response.json());
  }

  async function approveItem(item: DamageReportRecord) {
    setActionLoading(item.id);
    setError(null);
    const response = await fetch(`/api/inventory/damage-reports/${item.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    setActionLoading(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to approve.");
      return;
    }
    setApproveTarget(null);
    setItems((prev) => prev.map((row) => (row.id === item.id ? data : row)));
    router.refresh();
  }

  async function rejectItem(item: DamageReportRecord) {
    if (!rejectReason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setActionLoading(item.id);
    setError(null);
    const response = await fetch(`/api/inventory/damage-reports/${item.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    setActionLoading(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to reject.");
      return;
    }
    setRejectTarget(null);
    setRejectReason("");
    setItems((prev) => prev.map((row) => (row.id === item.id ? data : row)));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 px-0">
            <Link href="/inventory">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to inventory
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">Damaged Items</h1>
          <p className="text-sm text-slate-500">
            Panel damage reports with serial tracking and Super Admin approval.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/inventory/damaged/new">
              <Plus className="mr-2 h-4 w-4" />
              Add damaged
            </Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["all", "PENDING", "APPROVED", "REJECTED"] as const).map((value) => (
          <Button
            key={value}
            variant={status === value ? "default" : "outline"}
            size="sm"
            onClick={() => void applyFilter(value)}
            disabled={loading}
          >
            {value === "all" ? "All" : value === "PENDING" ? "Pending" : value === "APPROVED" ? "Approved" : "Rejected"}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  {canApprove ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={highlightId === item.id ? "bg-amber-50" : undefined}
                  >
                    <TableCell className="font-mono text-sm font-medium text-slate-900">
                      {item.serialNumber}
                    </TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{item.warehouseName}</TableCell>
                    <TableCell>{item.categoryLabel}</TableCell>
                    <TableCell className="max-w-xs text-slate-600">
                      <div>{item.reason}</div>
                      {item.decisionRemarks ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Decision: {item.decisionRemarks}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-600">
                      <div>{item.requestedByName}</div>
                      <div className="text-xs">{formatDate(item.createdAt)}</div>
                    </TableCell>
                    {canApprove ? (
                      <TableCell className="text-right">
                        {item.status === "PENDING" ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={actionLoading === item.id}
                              onClick={() => setApproveTarget(item)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionLoading === item.id}
                              onClick={() => {
                                setRejectReason("");
                                setRejectTarget(item);
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-slate-300" />
              <p className="text-slate-500">No damaged item reports yet.</p>
              {canCreate ? (
                <Button asChild variant="outline">
                  <Link href="/inventory/damaged/new">Add damaged panel</Link>
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {approveTarget ? (
        <Modal onClose={() => setApproveTarget(null)} size="sm">
          <ModalHeader
            title="Approve damage"
            description={`Mark serial ${approveTarget.serialNumber} as damaged?`}
            onClose={() => setApproveTarget(null)}
          />
          <ModalBody>
            <p className="text-sm text-slate-600">
              {approveTarget.productName} · {approveTarget.categoryLabel}: {approveTarget.reason}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={actionLoading === approveTarget.id}
              onClick={() => void approveItem(approveTarget)}
            >
              Approve
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {rejectTarget ? (
        <Modal onClose={() => setRejectTarget(null)} size="sm">
          <ModalHeader
            title="Reject damage report"
            description={`Reject damage for ${rejectTarget.serialNumber}?`}
            onClose={() => setRejectTarget(null)}
          />
          <ModalBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Panel returns to available stock. History is kept.
            </p>
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Reason *</Label>
              <textarea
                id="rejectReason"
                className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Why is this request rejected?"
                rows={3}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoading === rejectTarget.id || !rejectReason.trim()}
              onClick={() => void rejectItem(rejectTarget)}
            >
              Reject
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}
