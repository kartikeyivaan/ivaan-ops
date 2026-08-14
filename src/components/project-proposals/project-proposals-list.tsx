"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Share2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { normalizeMobileNumber } from "@/lib/phone";
import {
  canShareProjectProposal,
  formatRevisionProposalLabel,
  formatProjectProposalStatus,
  openProjectProposalPdf,
  projectProposalPdfUrl,
} from "@/lib/project-proposals";
import { canReviseProjectProposal, isPostConversionProposal } from "@/lib/project-proposal-revision";
import { formatDocumentDate } from "@/lib/utils";

type PackageOption = { id: string; code: string; name: string };
type ExecutiveOption = { id: string; name: string; email: string };

type ProposalRevision = {
  revisionNo: number;
  proposalDate: string;
  customerName: string;
  customerMobile: string;
  finalAmount: number;
  discountAmount: number;
  package: { code: string; name: string };
};

type ProposalListItem = {
  id: string;
  proposalNo: string;
  currentRevisionNo: number;
  status: string;
  convertedAt?: string | null;
  salesUser: { id: string; name: string };
  currentRevision: ProposalRevision | null;
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "APPROVED" || status === "SENT") return "success";
  if (status === "PENDING_APPROVAL" || status === "CONVERTED") return "warning";
  if (status === "REJECTED" || status === "EXPIRED") return "danger";
  return "default";
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function ProjectProposalsList({
  initialProposals,
  canManage,
  canApprove,
  showExecutiveFilter,
}: {
  initialProposals: ProposalListItem[];
  canManage: boolean;
  canApprove: boolean;
  showExecutiveFilter: boolean;
}) {
  const router = useRouter();
  const [proposals, setProposals] = useState(initialProposals);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [executives, setExecutives] = useState<ExecutiveOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [packageId, setPackageId] = useState("");

  const [approveTarget, setApproveTarget] = useState<ProposalListItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ProposalListItem | null>(null);
  const [approveRemarks, setApproveRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    async function loadMasters() {
      const [packagesRes, executivesRes] = await Promise.all([
        fetch("/api/project-proposals/packages"),
        showExecutiveFilter ? fetch("/api/project-proposals/sales-executives") : Promise.resolve(null),
      ]);

      if (packagesRes.ok) {
        setPackages(await packagesRes.json());
      }
      if (executivesRes?.ok) {
        setExecutives(await executivesRes.json());
      }
    }

    void loadMasters();
  }, [showExecutiveFilter]);

  async function applyFilters() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (status) params.set("status", status);
    if (salesUserId) params.set("salesUserId", salesUserId);
    if (packageId) params.set("packageId", packageId);
    if (customerMobile) params.set("customerMobile", customerMobile);
    if (customerName) params.set("q", customerName);

    const response = await fetch(`/api/project-proposals?${params.toString()}`);
    const data = await response.json();
    setLoading(false);

    if (response.ok) {
      setProposals(data);
    } else {
      setError(data.message ?? "Failed to load proposals.");
    }
  }

  async function refreshList() {
    await applyFilters();
  }

  async function downloadProposalPdf(proposal: ProposalListItem) {
    setActionLoading(proposal.id);
    setError(null);
    try {
      await openProjectProposalPdf(
        projectProposalPdfUrl(proposal.id, {
          revisionNo: proposal.currentRevisionNo,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the proposal PDF.");
    } finally {
      setActionLoading(null);
    }
  }

  async function shareWhatsapp(proposalId: string) {
    setActionLoading(proposalId);
    setError(null);
    const response = await fetch(`/api/project-proposals/${proposalId}/whatsapp`);
    const data = await response.json();
    setActionLoading(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to build WhatsApp share link.");
      return;
    }

    if (data.whatsappUrl) {
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setError("Customer mobile number is not valid for WhatsApp sharing.");
  }

  async function convertProposal(proposalId: string) {
    if (!window.confirm("Convert this approved proposal to a project?")) return;

    setActionLoading(proposalId);
    setError(null);
    const response = await fetch(`/api/project-proposals/${proposalId}/convert`, { method: "POST" });
    const data = await response.json();
    setActionLoading(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to convert proposal.");
      return;
    }

    await refreshList();
  }

  async function sendProposal(proposalId: string) {
    setActionLoading(proposalId);
    setError(null);
    const response = await fetch(`/api/project-proposals/${proposalId}/send`, { method: "POST" });
    const data = await response.json();
    setActionLoading(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to send proposal.");
      return;
    }

    await refreshList();
  }

  async function submitForApproval(proposalId: string) {
    setActionLoading(proposalId);
    setError(null);
    const response = await fetch(`/api/project-proposals/${proposalId}/submit-for-approval`, {
      method: "POST",
    });
    const data = await response.json();
    setActionLoading(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to submit proposal for approval.");
      return;
    }

    await refreshList();
  }

  async function submitApproval() {
    if (!approveTarget) return;

    setActionLoading(approveTarget.id);
    setError(null);
    const response = await fetch(`/api/project-proposals/${approveTarget.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarks: approveRemarks || undefined }),
    });
    const data = await response.json();
    setActionLoading(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to approve proposal.");
      return;
    }

    setApproveTarget(null);
    setApproveRemarks("");
    await refreshList();
  }

  async function submitRejection() {
    if (!rejectTarget || !rejectReason.trim()) {
      setError("A rejection reason is required.");
      return;
    }

    setActionLoading(rejectTarget.id);
    setError(null);
    const response = await fetch(`/api/project-proposals/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    const data = await response.json();
    setActionLoading(null);

    if (!response.ok) {
      setError(data.message ?? "Unable to reject proposal.");
      return;
    }

    setRejectTarget(null);
    setRejectReason("");
    await refreshList();
  }

  function canEditRow(item: ProposalListItem) {
    return canManage && (item.status === "DRAFT" || item.status === "REJECTED");
  }

  function canReviseRow(item: ProposalListItem) {
    return canManage && canReviseProjectProposal(item.status);
  }

  function canSendRow(item: ProposalListItem) {
    const discount = item.currentRevision?.discountAmount ?? 0;
    return (
      canManage &&
      item.status === "DRAFT" &&
      !isPostConversionProposal(item.convertedAt) &&
      discount <= DISCOUNT_APPROVAL_THRESHOLD
    );
  }

  function canSubmitApprovalRow(item: ProposalListItem) {
    const discount = item.currentRevision?.discountAmount ?? 0;
    const needsApproval =
      isPostConversionProposal(item.convertedAt) || discount > DISCOUNT_APPROVAL_THRESHOLD;
    return canManage && item.status === "DRAFT" && needsApproval;
  }

  function canShareRow(item: ProposalListItem) {
    return canShareProjectProposal(item.status);
  }

  function canDownloadRow(item: ProposalListItem) {
    return canShareProjectProposal(item.status);
  }

  function canConvertRow(item: ProposalListItem) {
    return canManage && item.status === "APPROVED" && !isPostConversionProposal(item.convertedAt);
  }

  function renderProposalActions(proposal: ProposalListItem) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={actionLoading === proposal.id}
            className="h-8 w-8 shrink-0 p-0"
            aria-label="Proposal actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => router.push(`/projects/proposals/${proposal.id}`)}>
            <FileText className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          {canEditRow(proposal) ? (
            <DropdownMenuItem
              onClick={() => router.push(`/projects/proposals/${proposal.id}/edit`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit Draft
            </DropdownMenuItem>
          ) : null}
          {canReviseRow(proposal) ? (
            <DropdownMenuItem
              onClick={() => router.push(`/projects/proposals/${proposal.id}/revise`)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {isPostConversionProposal(proposal.convertedAt) || proposal.status === "CONVERTED"
                ? "Update after conversion"
                : "Revise"}
            </DropdownMenuItem>
          ) : null}
          {canSendRow(proposal) ? (
            <DropdownMenuItem onClick={() => void sendProposal(proposal.id)}>
              <Send className="mr-2 h-4 w-4" />
              Send & Auto-Approve
            </DropdownMenuItem>
          ) : null}
          {canSubmitApprovalRow(proposal) ? (
            <DropdownMenuItem onClick={() => void submitForApproval(proposal.id)}>
              <Clock className="mr-2 h-4 w-4" />
              Submit for Approval
            </DropdownMenuItem>
          ) : null}
          {canDownloadRow(proposal) ? (
            <DropdownMenuItem
              disabled={actionLoading === proposal.id}
              onClick={() => void downloadProposalPdf(proposal)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </DropdownMenuItem>
          ) : null}
          {canShareRow(proposal) ? (
            <DropdownMenuItem onClick={() => void shareWhatsapp(proposal.id)}>
              <Share2 className="mr-2 h-4 w-4" />
              Share WhatsApp
            </DropdownMenuItem>
          ) : null}
          {canApprove && proposal.status === "PENDING_APPROVAL" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setApproveTarget(proposal)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRejectTarget(proposal)}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </DropdownMenuItem>
            </>
          ) : null}
          {canConvertRow(proposal) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void convertProposal(proposal.id)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Convert to Project
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Projects Proposal</h1>
          <p className="text-sm text-slate-500">
            Package-based solar project proposals with approvals and PDF sharing.
          </p>
        </div>
        {canManage ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/projects/proposals/new">
              <Plus className="h-4 w-4" />
              New Proposal
            </Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <CollapsibleFilterCard contentClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="fromDate">From Date</Label>
            <Input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toDate">To Date</Label>
            <Input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
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
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CONVERTED">Converted</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          {showExecutiveFilter ? (
            <div className="space-y-2">
              <Label htmlFor="salesUserId">Sales Executive</Label>
              <select
                id="salesUserId"
                value={salesUserId}
                onChange={(event) => setSalesUserId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">All executives</option>
                {executives.map((executive) => (
                  <option key={executive.id} value={executive.id}>
                    {executive.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="customerName">Customer Name</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Search customer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerMobile">Mobile Number</Label>
            <Input
              id="customerMobile"
              value={customerMobile}
              onChange={(event) =>
                setCustomerMobile(normalizeMobileNumber(event.target.value))
              }
              inputMode="numeric"
              placeholder="Search mobile"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="packageId">Package</Label>
            <select
              id="packageId"
              value={packageId}
              onChange={(event) => setPackageId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All packages</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.code} — {pkg.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end sm:col-span-2 md:col-span-1">
            <Button onClick={applyFilters} disabled={loading} className="w-full sm:w-auto">
              Apply Filters
            </Button>
          </div>
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3 md:hidden">
            {proposals.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No proposals found.
              </p>
            ) : (
              proposals.map((proposal) => {
                const revision = proposal.currentRevision;
                return (
                  <div
                    key={proposal.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => router.push(`/projects/proposals/${proposal.id}`)}
                          className="text-left font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          {proposal.proposalNo}
                        </button>
                        <p className="text-xs text-slate-500">
                          {formatRevisionProposalLabel(proposal.currentRevisionNo)} ·{" "}
                          {revision ? formatDocumentDate(revision.proposalDate) : "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant={statusVariant(proposal.status)}>
                          {formatProjectProposalStatus(proposal.status)}
                        </Badge>
                        {renderProposalActions(proposal)}
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-slate-500">Customer</dt>
                        <dd className="font-medium text-slate-900">
                          {revision?.customerName ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Mobile</dt>
                        <dd className="font-medium text-slate-900">
                          {revision?.customerMobile ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Package</dt>
                        <dd className="font-medium text-slate-900">
                          {revision?.package.name ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Sales Executive</dt>
                        <dd className="font-medium text-slate-900">{proposal.salesUser.name}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Final Amount</dt>
                        <dd className="font-medium text-slate-900">
                          {revision ? formatMoney(revision.finalAmount) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Discount</dt>
                        <dd className="font-medium text-slate-900">
                          {revision ? formatMoney(revision.discountAmount) : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proposal No</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Mobile Number</TableHead>
                  <TableHead>Sales Executive</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead className="text-right">Final Amount</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-slate-500">
                      No proposals found.
                    </TableCell>
                  </TableRow>
                ) : (
                  proposals.map((proposal) => {
                    const revision = proposal.currentRevision;
                    return (
                      <TableRow key={proposal.id}>
                        <TableCell className="font-medium">{proposal.proposalNo}</TableCell>
                        <TableCell>
                          {formatRevisionProposalLabel(proposal.currentRevisionNo)}
                        </TableCell>
                        <TableCell>
                          {revision ? formatDocumentDate(revision.proposalDate) : "—"}
                        </TableCell>
                        <TableCell>{revision?.customerName ?? "—"}</TableCell>
                        <TableCell>{revision?.customerMobile ?? "—"}</TableCell>
                        <TableCell>{proposal.salesUser.name}</TableCell>
                        <TableCell>{revision?.package.name ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {revision ? formatMoney(revision.finalAmount) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {revision ? formatMoney(revision.discountAmount) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(proposal.status)}>
                            {formatProjectProposalStatus(proposal.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-10 px-2 text-center">
                          {renderProposalActions(proposal)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {approveTarget ? (
        <Modal onClose={() => setApproveTarget(null)} size="md">
          <ModalHeader
            title="Approve Proposal"
            description={`Approve ${approveTarget.proposalNo} with discount ${formatMoney(
              approveTarget.currentRevision?.discountAmount ?? 0,
            )}?`}
            onClose={() => setApproveTarget(null)}
          />
          <ModalBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="approveRemarks">Remarks (optional)</Label>
              <Input
                id="approveRemarks"
                value={approveRemarks}
                onChange={(event) => setApproveRemarks(event.target.value)}
                placeholder="Approval notes"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitApproval()} disabled={actionLoading !== null}>
              Approve
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {rejectTarget ? (
        <Modal onClose={() => setRejectTarget(null)} size="md">
          <ModalHeader
            title="Reject Proposal"
            description={`Reject ${rejectTarget.proposalNo} and return it to the sales executive.`}
            onClose={() => setRejectTarget(null)}
          />
          <ModalBody className="space-y-4">
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
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitRejection()}
              disabled={actionLoading !== null || !rejectReason.trim()}
            >
              Reject
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}
