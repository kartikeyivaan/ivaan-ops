"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { formatProjectEnquiryStatus } from "@/lib/project-enquiries";

type FollowupEntry = {
  id: string;
  note: string;
  outcome: string | null;
  followupDate: string;
  nextFollowupAt: string;
  createdBy: { name: string };
};

type EnquiryDetail = {
  id: string;
  enquiryNo: string;
  customerName: string;
  customerMobile: string;
  status: "OPEN" | "PROPOSAL_SENT" | "WON" | "LOST";
  nextFollowupAt: string;
  lastFollowupAt: string | null;
  lostReason: string | null;
  salesUser: { name: string };
  proposal: { id: string; proposalNo: string; status: string } | null;
  followups: FollowupEntry[];
};

function statusVariant(status: EnquiryDetail["status"]): "default" | "success" | "warning" | "danger" {
  if (status === "WON") return "success";
  if (status === "LOST") return "danger";
  if (status === "PROPOSAL_SENT") return "warning";
  return "default";
}

export function ProjectEnquiryDetail({
  enquiry,
  canManage,
}: {
  enquiry: EnquiryDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFollowup, setShowFollowup] = useState(false);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowupAt, setNextFollowupAt] = useState(enquiry.nextFollowupAt);

  async function saveFollowup() {
    if (!note.trim() || !nextFollowupAt) return;
    setLoading(true);
    const response = await fetch(`/api/project-enquiries/${enquiry.id}/followups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note,
        outcome: outcome || undefined,
        followupDate: new Date().toISOString().slice(0, 10),
        nextFollowupAt,
      }),
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.message ?? "Unable to save follow-up.");
      return;
    }
    setShowFollowup(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{enquiry.enquiryNo}</h1>
          <p className="text-sm text-slate-500">{enquiry.customerName} · {enquiry.customerMobile}</p>
        </div>
        <Badge variant={statusVariant(enquiry.status)}>{formatProjectEnquiryStatus(enquiry.status)}</Badge>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="flex flex-wrap gap-2">
        {enquiry.proposal ? (
          <Button asChild variant="outline">
            <Link href={`/projects/proposals/${enquiry.proposal.id}`}>View Proposal</Link>
          </Button>
        ) : canManage ? (
          <Button asChild variant="outline">
            <Link href={`/projects/proposals/new?enquiryId=${enquiry.id}`}>Create Proposal</Link>
          </Button>
        ) : null}
        {canManage && enquiry.status !== "WON" && enquiry.status !== "LOST" ? (
          <Button onClick={() => setShowFollowup(true)}>Add Follow-up</Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enquiry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-slate-500">Owner:</span> {enquiry.salesUser.name}</p>
            <p><span className="text-slate-500">Next follow-up:</span> {enquiry.nextFollowupAt}</p>
            <p><span className="text-slate-500">Last follow-up:</span> {enquiry.lastFollowupAt ?? "—"}</p>
            {enquiry.lostReason ? <p><span className="text-slate-500">Lost reason:</span> {enquiry.lostReason}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proposal Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {enquiry.proposal ? (
              <>
                <p><span className="text-slate-500">Proposal:</span> {enquiry.proposal.proposalNo}</p>
                <p><span className="text-slate-500">Status:</span> {enquiry.proposal.status}</p>
              </>
            ) : (
              <p className="text-slate-500">No proposal linked yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Follow-up Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {enquiry.followups.length === 0 ? (
            <p className="text-sm text-slate-500">No follow-ups recorded yet.</p>
          ) : enquiry.followups.map((entry) => (
            <div key={entry.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">{entry.note}</p>
              {entry.outcome ? <p className="mt-1 text-slate-700">{entry.outcome}</p> : null}
              <p className="mt-1 text-xs text-slate-500">
                {entry.followupDate} · next {entry.nextFollowupAt} · by {entry.createdBy.name}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {showFollowup ? (
        <Modal onClose={() => setShowFollowup(false)} size="md">
          <ModalHeader title="Add Follow-up" onClose={() => setShowFollowup(false)} />
          <ModalBody className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="note">Note *</Label>
              <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outcome">Outcome</Label>
              <Input id="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextFollowupAt">Next Follow-up *</Label>
              <Input id="nextFollowupAt" type="date" value={nextFollowupAt} onChange={(event) => setNextFollowupAt(event.target.value)} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowFollowup(false)}>Cancel</Button>
            <Button onClick={() => void saveFollowup()} disabled={loading || !note.trim() || !nextFollowupAt}>Save</Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}
