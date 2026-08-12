"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { formatProjectEnquiryStatus } from "@/lib/project-enquiries";
import { normalizeMobileNumber } from "@/lib/phone";

type EnquiryItem = {
  id: string;
  enquiryNo: string;
  customerName: string;
  customerMobile: string;
  status: "OPEN" | "PROPOSAL_SENT" | "WON" | "LOST";
  nextFollowupAt: string;
  lastFollowupAt: string | null;
  salesUser: { id: string; name: string };
  proposal: { id: string; proposalNo: string; status: string } | null;
};

type ExecutiveOption = { id: string; name: string };

function statusVariant(status: EnquiryItem["status"]): "default" | "success" | "warning" | "danger" {
  if (status === "WON") return "success";
  if (status === "LOST") return "danger";
  if (status === "PROPOSAL_SENT") return "warning";
  return "default";
}

function isOverdue(item: EnquiryItem) {
  if (item.status === "WON" || item.status === "LOST") return false;
  return new Date(`${item.nextFollowupAt}T00:00:00`) < new Date(new Date().toDateString());
}

export function ProjectEnquiriesList({
  initialEnquiries,
  canManage,
  showExecutiveFilter,
}: {
  initialEnquiries: EnquiryItem[];
  canManage: boolean;
  showExecutiveFilter: boolean;
}) {
  const router = useRouter();
  const [enquiries, setEnquiries] = useState(initialEnquiries);
  const [executives, setExecutives] = useState<ExecutiveOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [followupTarget, setFollowupTarget] = useState<EnquiryItem | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowupAt, setNextFollowupAt] = useState("");
  const [lostTarget, setLostTarget] = useState<EnquiryItem | null>(null);
  const [lostReason, setLostReason] = useState("");

  useEffect(() => {
    if (!showExecutiveFilter) return;
    void fetch("/api/project-enquiries/sales-executives").then(async (response) => {
      if (!response.ok) return;
      setExecutives(await response.json());
    });
  }, [showExecutiveFilter]);

  async function refresh() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (salesUserId) params.set("salesUserId", salesUserId);
    if (customerMobile) params.set("customerMobile", customerMobile);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    const response = await fetch(`/api/project-enquiries?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message ?? "Failed to load enquiries.");
      return;
    }
    setEnquiries(data);
  }

  async function markWon(item: EnquiryItem) {
    if (!window.confirm("Mark this enquiry as Won?")) return;
    setActionLoading(item.id);
    const response = await fetch(`/api/project-enquiries/${item.id}/mark-won`, { method: "POST" });
    setActionLoading(null);
    if (!response.ok) {
      const data = await response.json();
      setError(data.message ?? "Unable to mark enquiry won.");
      return;
    }
    await refresh();
  }

  async function markLost() {
    if (!lostTarget || !lostReason.trim()) return;
    setActionLoading(lostTarget.id);
    const response = await fetch(`/api/project-enquiries/${lostTarget.id}/mark-lost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lostReason }),
    });
    setActionLoading(null);
    if (!response.ok) {
      const data = await response.json();
      setError(data.message ?? "Unable to mark enquiry lost.");
      return;
    }
    setLostReason("");
    setLostTarget(null);
    await refresh();
  }

  async function submitFollowup() {
    if (!followupTarget || !note.trim() || !nextFollowupAt) {
      setError("Follow-up note and next follow-up date are required.");
      return;
    }
    setActionLoading(followupTarget.id);
    const today = new Date().toISOString().slice(0, 10);
    const response = await fetch(`/api/project-enquiries/${followupTarget.id}/followups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note,
        outcome: outcome || undefined,
        followupDate: today,
        nextFollowupAt,
      }),
    });
    setActionLoading(null);
    if (!response.ok) {
      const data = await response.json();
      setError(data.message ?? "Unable to save follow-up.");
      return;
    }
    setFollowupTarget(null);
    setNote("");
    setOutcome("");
    setNextFollowupAt("");
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Project Enquiries</h1>
          <p className="text-sm text-slate-500">
            Track follow-ups from enquiry to proposal conversion.
          </p>
        </div>
        {canManage ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/projects/enquiries/new">New Enquiry</Link>
          </Button>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <CollapsibleFilterCard contentClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="q">Search</Label>
          <Input id="q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Enquiry no or customer" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" value={status} onChange={(event) => setStatus(event.target.value)} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="PROPOSAL_SENT">Proposal Sent</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
        </div>
        {showExecutiveFilter ? (
          <div className="space-y-2">
            <Label htmlFor="salesUserId">Sales Executive</Label>
            <select id="salesUserId" value={salesUserId} onChange={(event) => setSalesUserId(event.target.value)} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
              <option value="">All executives</option>
              {executives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="customerMobile">Mobile</Label>
          <Input id="customerMobile" value={customerMobile} onChange={(event) => setCustomerMobile(normalizeMobileNumber(event.target.value))} placeholder="Search mobile" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fromDate">From follow-up</Label>
          <Input id="fromDate" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="toDate">To follow-up</Label>
          <Input id="toDate" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={() => void refresh()} disabled={loading} className="w-full sm:w-auto">
            Apply Filters
          </Button>
        </div>
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {enquiries.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No enquiries found.
            </p>
          ) : enquiries.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <button type="button" onClick={() => router.push(`/projects/enquiries/${item.id}`)} className="font-semibold text-slate-900 hover:text-emerald-700">
                    {item.enquiryNo}
                  </button>
                  <p className="text-sm text-slate-600">{item.customerName} · {item.customerMobile}</p>
                  <p className="text-xs text-slate-500">Owner: {item.salesUser.name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isOverdue(item) ? <Badge variant="danger">Overdue</Badge> : null}
                  <Badge variant={statusVariant(item.status)}>{formatProjectEnquiryStatus(item.status)}</Badge>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                <p>Next follow-up: <span className="font-medium">{item.nextFollowupAt}</span></p>
                <div className="flex flex-wrap gap-2">
                  {item.proposal ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/projects/proposals/${item.proposal.id}`}>View Proposal</Link>
                    </Button>
                  ) : canManage ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/projects/proposals/new?enquiryId=${item.id}`}>Create Proposal</Link>
                    </Button>
                  ) : null}
                  {canManage && item.status !== "WON" && item.status !== "LOST" ? (
                    <Button size="sm" variant="outline" onClick={() => setFollowupTarget(item)} disabled={actionLoading === item.id}>
                      Add Follow-up
                    </Button>
                  ) : null}
                  {canManage && item.status !== "WON" ? (
                    <Button size="sm" onClick={() => void markWon(item)} disabled={actionLoading === item.id}>
                      Mark Won
                    </Button>
                  ) : null}
                  {canManage && item.status !== "LOST" ? (
                    <Button size="sm" variant="outline" onClick={() => setLostTarget(item)} disabled={actionLoading === item.id}>
                      Mark Lost
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {followupTarget ? (
        <Modal onClose={() => setFollowupTarget(null)} size="md">
          <ModalHeader title={`Add Follow-up: ${followupTarget.enquiryNo}`} onClose={() => setFollowupTarget(null)} />
          <ModalBody className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="followupNote">Note *</Label>
              <Input id="followupNote" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followupOutcome">Outcome</Label>
              <Input id="followupOutcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextFollowupAt">Next follow-up *</Label>
              <Input id="nextFollowupAt" type="date" value={nextFollowupAt} onChange={(event) => setNextFollowupAt(event.target.value)} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setFollowupTarget(null)}>Cancel</Button>
            <Button onClick={() => void submitFollowup()} disabled={actionLoading !== null}>Save</Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {lostTarget ? (
        <Modal onClose={() => setLostTarget(null)} size="md">
          <ModalHeader title={`Mark Lost: ${lostTarget.enquiryNo}`} onClose={() => setLostTarget(null)} />
          <ModalBody className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="lostReason">Reason *</Label>
              <Input id="lostReason" value={lostReason} onChange={(event) => setLostReason(event.target.value)} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setLostTarget(null)}>Cancel</Button>
            <Button onClick={() => void markLost()} disabled={actionLoading !== null || !lostReason.trim()}>Mark Lost</Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}
