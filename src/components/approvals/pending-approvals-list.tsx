"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, History, XCircle } from "lucide-react";
import {
  approvalTypeLabel,
  type PendingApprovalItem,
} from "@/lib/approvals-service";
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

function approveEndpoint(item: PendingApprovalItem): { url: string; body?: object } {
  switch (item.type) {
    case "QUOTATION_PRICE":
      return { url: `/api/quotations/${item.moduleId}/approve-price`, body: {} };
    case "PI_BOOKING":
      return { url: `/api/proforma-invoices/${item.moduleId}/approve-booking`, body: {} };
    case "DISPATCH_TODAY":
      return {
        url: `/api/proforma-invoices/${item.moduleId}/approve-dispatch-today`,
        body: {},
      };
    case "CROSS_COMPANY_TRANSFER":
      return {
        url: `/api/cross-company-transfers/${item.moduleId}/approve`,
        body: {},
      };
    case "DC_CANCEL":
      return { url: `/api/dispatches/${item.moduleId}/approve-cancel`, body: {} };
    case "PI_CANCEL":
      return { url: `/api/proforma-invoices/${item.moduleId}/approve-cancel`, body: {} };
    case "PROJECT_PROPOSAL":
      return { url: `/api/project-proposals/${item.moduleId}/approve`, body: {} };
    case "OPENING_STOCK":
      return {
        url: `/api/inventory/audits/opening/${item.moduleId}`,
        body: { action: "approve" },
      };
    case "PANEL_DAMAGE":
      return { url: `/api/inventory/damage-reports/${item.moduleId}/approve`, body: {} };
    case "INCOMING_LOT_EDIT":
      return {
        url: `/api/inventory/incoming/change-requests/${item.moduleId}/approve`,
        body: {},
      };
  }
}

function rejectEndpoint(
  item: PendingApprovalItem,
  reason: string,
): { url: string; body: object } {
  switch (item.type) {
    case "QUOTATION_PRICE":
      return { url: `/api/quotations/${item.moduleId}/reject-price`, body: { reason } };
    case "PI_BOOKING":
      return { url: `/api/proforma-invoices/${item.moduleId}/reject-booking`, body: { reason } };
    case "DISPATCH_TODAY":
      return {
        url: `/api/proforma-invoices/${item.moduleId}/reject-dispatch-today`,
        body: { reason },
      };
    case "CROSS_COMPANY_TRANSFER":
      return {
        url: `/api/cross-company-transfers/${item.moduleId}/reject`,
        body: { reason },
      };
    case "DC_CANCEL":
      return { url: `/api/dispatches/${item.moduleId}/reject-cancel`, body: { reason } };
    case "PI_CANCEL":
      return { url: `/api/proforma-invoices/${item.moduleId}/reject-cancel`, body: { reason } };
    case "PROJECT_PROPOSAL":
      return { url: `/api/project-proposals/${item.moduleId}/reject`, body: { reason } };
    case "OPENING_STOCK":
      return {
        url: `/api/inventory/audits/opening/${item.moduleId}`,
        body: { action: "reject", reason },
      };
    case "PANEL_DAMAGE":
      return {
        url: `/api/inventory/damage-reports/${item.moduleId}/reject`,
        body: { reason },
      };
    case "INCOMING_LOT_EDIT":
      return {
        url: `/api/inventory/incoming/change-requests/${item.moduleId}/reject`,
        body: { reason },
      };
  }
}

export function PendingApprovalsList({
  initialItems,
}: {
  initialItems: PendingApprovalItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingApprovalItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  function removeFromLanding(itemId: string) {
    setItems((prev) => prev.filter((row) => row.id !== itemId));
    setApproveTarget(null);
    setRejectTarget(null);
    setRejectReason("");
    router.refresh();
  }

  async function approveItem(item: PendingApprovalItem) {
    setActionLoading(item.id);
    setError(null);
    const { url, body } = approveEndpoint(item);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await response.json().catch(() => ({}));
    setActionLoading(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to approve.");
      return;
    }
    removeFromLanding(item.id);
  }

  async function rejectItem(item: PendingApprovalItem) {
    if (!rejectReason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setActionLoading(item.id);
    setError(null);
    const { url, body } = rejectEndpoint(item, rejectReason.trim());
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setActionLoading(null);
    if (!response.ok) {
      setError(data.message ?? "Unable to reject.");
      return;
    }
    removeFromLanding(item.id);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pending Approvals</h1>
          <p className="text-sm text-slate-500">
            Items awaiting your approval. After approve or reject they move to History.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/approvals/history">
            <History className="h-4 w-4" />
            History
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Customer / subject</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(item.href)}
                  >
                    <TableCell>
                      <Badge variant="warning">{approvalTypeLabel(item.type)}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{item.documentNo}</TableCell>
                    <TableCell>{item.subjectName}</TableCell>
                    <TableCell className="max-w-xs text-slate-600">{item.reason}</TableCell>
                    <TableCell>{item.requestedByName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-slate-600">
                      {formatDate(item.requestedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex flex-wrap justify-end gap-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          disabled={actionLoading === item.id}
                          onClick={() => setApproveTarget(item)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        {item.canReject ? (
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
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-slate-500">No pending approvals.</p>
          )}
        </CardContent>
      </Card>

      {approveTarget ? (
        <Modal onClose={() => setApproveTarget(null)} size="sm">
          <ModalHeader
            title="Confirm approval"
            description={`Approve ${approveTarget.documentNo} (${approvalTypeLabel(approveTarget.type)})?`}
            onClose={() => setApproveTarget(null)}
          />
          <ModalBody>
            <p className="text-sm text-slate-600">
              {approveTarget.subjectName} · {approveTarget.reason}
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
            title="Reject approval"
            description={`Reject ${rejectTarget.documentNo} (${approvalTypeLabel(rejectTarget.type)})?`}
            onClose={() => setRejectTarget(null)}
          />
          <ModalBody className="space-y-3">
            <p className="text-sm text-slate-600">
              {rejectTarget.subjectName} · {rejectTarget.reason}
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
