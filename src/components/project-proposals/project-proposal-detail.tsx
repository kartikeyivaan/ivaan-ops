"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DISCOUNT_APPROVAL_THRESHOLD } from "@/lib/project-proposal-pricing";
import {
  canShareProjectProposal,
  formatApprovalStatus,
  formatRevisionProposalLabel,
  formatProjectProposalStatus,
  openProjectProposalPdf,
  projectProposalPdfUrl,
} from "@/lib/project-proposals";
import { canReviseProjectProposal } from "@/lib/project-proposal-revision";
import { formatDocumentDate } from "@/lib/utils";

type UserRef = { id: string; name: string; email?: string };

type StatusHistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  remarks: string | null;
  revisionNo: number | null;
  createdAt: string;
  changedBy: UserRef;
};

type ApprovalEntry = {
  id: string;
  status: string;
  discountAmount: number;
  remarks: string | null;
  revisionNo: number;
  createdAt: string;
  updatedAt: string;
  requestedBy: UserRef;
  decidedBy: UserRef | null;
};

type RevisionSummary = {
  revisionNo: number;
  proposalDate: string;
  customerName: string;
  finalAmount: number;
  discountAmount: number;
  package: { name: string };
};

type ProposalDetail = {
  id: string;
  proposalNo: string;
  currentRevisionNo: number;
  status: string;
  convertedAt?: string | null;
  salesUser: { name: string };
  executionProject?: { id: string; projectNo: string; status: string } | null;
  revisions?: RevisionSummary[];
  currentRevision: {
    proposalDate: string;
    validityDate: string;
    customerName: string;
    customerMobile: string;
    shortAddress: string;
    finalAmount: number;
    discountAmount: number;
    subsidyEstimate: number;
    effectiveCustomerInvestment: number;
    package: { code: string; name: string };
    connectionPhase: string;
    structureType: string;
    buildingType: string;
    inverterBrands: string[];
    notes?: string | null;
  } | null;
  statusHistory?: StatusHistoryEntry[];
  approvals?: ApprovalEntry[];
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "APPROVED" || status === "SENT") return "success";
  if (status === "PENDING_APPROVAL" || status === "CONVERTED") return "warning";
  if (status === "REJECTED" || status === "EXPIRED") return "danger";
  return "default";
}

function approvalVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "REJECTED") return "danger";
  return "default";
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProjectProposalDetail({
  proposal,
  canManage,
  canApprove,
  canConvert,
}: {
  proposal: ProposalDetail;
  canManage: boolean;
  canApprove: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();
  const revision = proposal.currentRevision;
  const discountAmount = revision?.discountAmount ?? 0;
  const requiresApproval = discountAmount > DISCOUNT_APPROVAL_THRESHOLD;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [approveRemarks, setApproveRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const pendingApproval = useMemo(
    () => proposal.approvals?.find((entry) => entry.status === "PENDING") ?? null,
    [proposal.approvals],
  );

  const latestRejectedApproval = useMemo(
    () => proposal.approvals?.find((entry) => entry.status === "REJECTED") ?? null,
    [proposal.approvals],
  );

  const canEdit = canManage && (proposal.status === "DRAFT" || proposal.status === "REJECTED");
  const canRevise = canManage && canReviseProjectProposal(proposal.status);
  const canSendDraft = canManage && proposal.status === "DRAFT" && !requiresApproval;
  const canSubmitForApproval = canManage && proposal.status === "DRAFT" && requiresApproval;
  const canDownloadOrShare = canShareProjectProposal(proposal.status);
  const canDownloadPdf = canManage || canDownloadOrShare;

  async function openProposalPdf(format: "card" | "full") {
    setLoading(true);
    setError(null);
    try {
      await openProjectProposalPdf(
        projectProposalPdfUrl(proposal.id, {
          format,
          revisionNo: proposal.currentRevisionNo,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the proposal PDF.");
    } finally {
      setLoading(false);
    }
  }

  async function shareWhatsapp() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/project-proposals/${proposal.id}/whatsapp`);
    const data = await response.json();
    setLoading(false);
    if (!response.ok || !data.whatsappUrl) {
      setError(data.message ?? "Unable to build WhatsApp share link.");
      return;
    }
    window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
  }

  async function convertProposal() {
    if (!window.confirm("Convert this approved proposal to a project?")) return;
    setLoading(true);
    const response = await fetch(`/api/project-proposals/${proposal.id}/convert`, {
      method: "POST",
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.message ?? "Unable to convert proposal.");
      return;
    }
    const data = await response.json();
    if (data.project?.id) {
      router.push(`/projects/execution/${data.project.id}`);
      return;
    }
    router.refresh();
  }

  async function sendProposal() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/project-proposals/${proposal.id}/send`, { method: "POST" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to send proposal.");
      return;
    }
    router.refresh();
  }

  async function submitForApproval() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/project-proposals/${proposal.id}/submit-for-approval`, {
      method: "POST",
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to submit proposal for approval.");
      return;
    }
    router.refresh();
  }

  async function approveProposal() {
    setLoading(true);
    const response = await fetch(`/api/project-proposals/${proposal.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarks: approveRemarks || undefined }),
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.message ?? "Unable to approve proposal.");
      return;
    }
    setShowApprove(false);
    router.refresh();
  }

  async function rejectProposal() {
    if (!rejectReason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setLoading(true);
    const response = await fetch(`/api/project-proposals/${proposal.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.message ?? "Unable to reject proposal.");
      return;
    }
    setShowReject(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{proposal.proposalNo}</h1>
          <p className="text-sm text-slate-500">
            {formatRevisionProposalLabel(proposal.currentRevisionNo)} ·{" "}
            {proposal.salesUser.name}
          </p>
        </div>
        <Badge variant={statusVariant(proposal.status)} className="w-fit">
          {formatProjectProposalStatus(proposal.status)}
        </Badge>
      </div>

      {proposal.status === "PENDING_APPROVAL" ? (
        <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Pending manager approval</p>
            <p>
              Discount of {formatMoney(discountAmount)} exceeds the ₹
              {DISCOUNT_APPROVAL_THRESHOLD.toLocaleString("en-IN")} limit. A manager must approve
              before this proposal can be shared or converted.
            </p>
            {pendingApproval ? (
              <p className="mt-1 text-amber-800">
                Requested by {pendingApproval.requestedBy.name} on{" "}
                {formatDateTime(pendingApproval.createdAt)}.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {proposal.status === "REJECTED" && latestRejectedApproval?.remarks ? (
        <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Proposal rejected</p>
            <p>{latestRejectedApproval.remarks}</p>
            {latestRejectedApproval.decidedBy ? (
              <p className="mt-1 text-red-700">
                Rejected by {latestRejectedApproval.decidedBy.name} on{" "}
                {formatDateTime(latestRejectedApproval.updatedAt)}.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {proposal.status === "APPROVED" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          This proposal is approved. You can download, share, or convert it to a project.
        </div>
      ) : null}

      {(proposal.status === "APPROVED" || proposal.status === "CONVERTED") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Handoff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {proposal.executionProject ? (
              <>
                <p className="text-slate-600">
                  This proposal was converted to project{" "}
                  <Link
                    href={`/projects/execution/${proposal.executionProject.id}`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {proposal.executionProject.projectNo}
                  </Link>
                  .
                </p>
                {proposal.convertedAt ? (
                  <p className="text-slate-500">
                    Converted on {formatDateTime(proposal.convertedAt)}.
                  </p>
                ) : null}
              </>
            ) : canConvert && proposal.status === "APPROVED" ? (
              <p className="text-slate-600">
                Start material assignment by converting this proposal to a project execution
                record.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canEdit ? (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={`/projects/proposals/${proposal.id}/edit`}>Edit Draft</Link>
          </Button>
        ) : null}
        {canRevise ? (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={`/projects/proposals/${proposal.id}/revise`}>Revise</Link>
          </Button>
        ) : null}
        {canSendDraft ? (
          <Button
            onClick={() => void sendProposal()}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            <Send className="h-4 w-4" />
            Send & Auto-Approve
          </Button>
        ) : null}
        {canSubmitForApproval ? (
          <Button
            onClick={() => void submitForApproval()}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Submit for Manager Approval
          </Button>
        ) : null}
        {canDownloadPdf ? (
          <>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={loading}
              onClick={() => void openProposalPdf("card")}
            >
              Quote Card
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={loading}
              onClick={() => void openProposalPdf("full")}
            >
              Full Proposal
            </Button>
          </>
        ) : null}
        {canDownloadOrShare ? (
          <>
            <Button
              variant="outline"
              onClick={() => void shareWhatsapp()}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Share WhatsApp
            </Button>
          </>
        ) : null}
        {canApprove && proposal.status === "PENDING_APPROVAL" ? (
          <>
            <Button
              onClick={() => setShowApprove(true)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowReject(true)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Reject
            </Button>
          </>
        ) : null}
        {canConvert && proposal.status === "APPROVED" ? (
          <Button
            onClick={() => void convertProposal()}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Convert to Project
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Name:</span> {revision?.customerName ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Mobile:</span> {revision?.customerMobile ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Address:</span> {revision?.shortAddress ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Package & Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Package:</span> {revision?.package.name ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Connection:</span>{" "}
              {revision?.connectionPhase.replaceAll("_", " ") ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Structure:</span>{" "}
              {revision?.structureType.replaceAll("_", " ") ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Building:</span>{" "}
              {revision?.buildingType ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Inverter brands:</span>{" "}
              {revision?.inverterBrands.join(", ") ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Proposal date:</span>{" "}
              {revision ? formatDocumentDate(revision.proposalDate) : "—"}
            </p>
            <p>
              <span className="text-slate-500">Valid until:</span>{" "}
              {revision ? formatDocumentDate(revision.validityDate) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Final amount:</span>{" "}
              {revision ? formatMoney(revision.finalAmount) : "—"}
            </p>
            <p>
              <span className="text-slate-500">Discount:</span>{" "}
              {revision ? formatMoney(revision.discountAmount) : "—"}
              {requiresApproval ? (
                <span className="ml-2 text-xs text-amber-700">(requires manager approval)</span>
              ) : null}
            </p>
            <p>
              <span className="text-slate-500">Estimated subsidy:</span>{" "}
              {revision ? formatMoney(revision.subsidyEstimate) : "—"}
            </p>
            <p>
              <span className="text-slate-500">Effective customer investment:</span>{" "}
              {revision ? formatMoney(revision.effectiveCustomerInvestment) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {(proposal.revisions?.length ?? 0) > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revision History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(proposal.revisions ?? []).map((entry) => {
              const isActive = entry.revisionNo === proposal.currentRevisionNo;
              return (
                <div
                  key={entry.revisionNo}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {proposal.proposalNo} · {formatRevisionProposalLabel(entry.revisionNo)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {entry.customerName} · {entry.package.name} · {formatMoney(entry.finalAmount)}
                    </p>
                  </div>
                  {isActive ? (
                    <Badge variant="success" className="w-fit">
                      Active
                    </Badge>
                  ) : (
                    <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                      <Link href={`/projects/proposals/${proposal.id}/revisions/${entry.revisionNo}`}>
                        View Snapshot
                      </Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {proposal.approvals && proposal.approvals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval Audit Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {proposal.approvals.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900">
                      {formatRevisionProposalLabel(entry.revisionNo)}
                    </p>
                    <Badge variant={approvalVariant(entry.status)}>
                      {formatApprovalStatus(entry.status)}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Discount</dt>
                      <dd className="font-medium text-slate-900">
                        {formatMoney(entry.discountAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Date</dt>
                      <dd className="font-medium text-slate-900">
                        {formatDateTime(entry.updatedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Requested By</dt>
                      <dd className="font-medium text-slate-900">{entry.requestedBy.name}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Decided By</dt>
                      <dd className="font-medium text-slate-900">
                        {entry.decidedBy?.name ?? "—"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">Remarks</dt>
                      <dd className="font-medium text-slate-900">{entry.remarks ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Revision</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Decided By</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposal.approvals.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatRevisionProposalLabel(entry.revisionNo)}</TableCell>
                      <TableCell>
                        <Badge variant={approvalVariant(entry.status)}>
                          {formatApprovalStatus(entry.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatMoney(entry.discountAmount)}</TableCell>
                      <TableCell>{entry.requestedBy.name}</TableCell>
                      <TableCell>{entry.decidedBy?.name ?? "—"}</TableCell>
                      <TableCell>{entry.remarks ?? "—"}</TableCell>
                      <TableCell>{formatDateTime(entry.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {proposal.statusHistory && proposal.statusHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {proposal.statusHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900">
                      {entry.revisionNo !== null
                        ? formatRevisionProposalLabel(entry.revisionNo)
                        : "—"}
                    </p>
                    <Badge variant={statusVariant(entry.toStatus)}>
                      {formatProjectProposalStatus(entry.toStatus)}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">From</dt>
                      <dd className="font-medium text-slate-900">
                        {entry.fromStatus
                          ? formatProjectProposalStatus(entry.fromStatus)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Date</dt>
                      <dd className="font-medium text-slate-900">
                        {formatDateTime(entry.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Changed By</dt>
                      <dd className="font-medium text-slate-900">{entry.changedBy.name}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">Remarks</dt>
                      <dd className="font-medium text-slate-900">{entry.remarks ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revision</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposal.statusHistory.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {entry.revisionNo !== null
                        ? formatRevisionProposalLabel(entry.revisionNo)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {entry.fromStatus
                        ? formatProjectProposalStatus(entry.fromStatus)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(entry.toStatus)}>
                        {formatProjectProposalStatus(entry.toStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>{entry.changedBy.name}</TableCell>
                    <TableCell>{entry.remarks ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showApprove ? (
        <Modal onClose={() => setShowApprove(false)} size="md">
          <ModalHeader title="Approve Proposal" onClose={() => setShowApprove(false)} />
          <ModalBody>
            <div className="space-y-2">
              <Label htmlFor="approveRemarks">Remarks (optional)</Label>
              <Input
                id="approveRemarks"
                value={approveRemarks}
                onChange={(event) => setApproveRemarks(event.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowApprove(false)}>
              Cancel
            </Button>
            <Button onClick={() => void approveProposal()} disabled={loading}>
              Approve
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {showReject ? (
        <Modal onClose={() => setShowReject(false)} size="md">
          <ModalHeader title="Reject Proposal" onClose={() => setShowReject(false)} />
          <ModalBody>
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Reason *</Label>
              <Input
                id="rejectReason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Why is this proposal rejected?"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void rejectProposal()}
              disabled={loading || !rejectReason.trim()}
            >
              Reject
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}
