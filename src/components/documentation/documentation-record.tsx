"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RecordData = {
  id: string; status: string; ageingDays: number; remarks: string | null; internalNotes: string | null;
  holdReason: string | null; reviewReason: string | null;
  dispatch: { dcNo: string; dispatchDate: string; receiverName: string | null; receiverMobile: string | null };
  invoiceHandover: { invoiceNumber: string | null; invoiceDate: string | null };
  customer: { customerName: string; mobile: string | null };
  assignedTo: { id: string; name: string } | null;
  statusHistory: Array<{ id: string; toStatus: string; remarks: string | null; changedAt: string; changedBy: { name: string } }>;
};

export function DocumentationRecordView({ record, users, canManage, canAssign }: {
  record: RecordData; users: Array<{ id: string; name: string }>; canManage: boolean; canAssign: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(record.status);
  const [reason, setReason] = useState(record.holdReason ?? record.reviewReason ?? "");
  const [remarks, setRemarks] = useState(record.remarks ?? "");
  const [assignee, setAssignee] = useState(record.assignedTo?.id ?? "");
  const [error, setError] = useState("");

  async function updateStatus() {
    const response = await fetch(`/api/documentation/${record.id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, holdReason: status === "HOLD" ? reason : undefined, reviewReason: status === "FOR_REVIEW" ? reason : undefined, remarks }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.message ?? "Unable to update status.");
    router.refresh();
  }

  async function assign() {
    const response = await fetch(`/api/documentation/${record.id}/assign`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: assignee || null }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.message ?? "Unable to assign.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">{record.customer.customerName}</h1><p className="text-sm text-slate-500">{record.dispatch.dcNo} · {record.ageingDays} days</p></div>
        <Button variant="outline" asChild><Link href="/documentation">Back</Link></Button>
      </div>
      <Card><CardContent className="grid gap-3 pt-5 text-sm sm:grid-cols-2">
        <p><span className="text-slate-500">Invoice:</span> {record.invoiceHandover.invoiceNumber ?? "—"}</p>
        <p><span className="text-slate-500">Receiver:</span> {record.dispatch.receiverName ?? "—"} {record.dispatch.receiverMobile ?? ""}</p>
        <p><span className="text-slate-500">Status:</span> {record.status.replaceAll("_", " ")}</p>
        <p><span className="text-slate-500">Assigned to:</span> {record.assignedTo?.name ?? "Unassigned"}</p>
      </CardContent></Card>
      {canManage ? <Card><CardHeader><CardTitle className="text-base">Update workflow</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Status</Label><select className="h-10 w-full rounded-md border bg-white px-3" value={status} onChange={(e) => setStatus(e.target.value)}>{["PENDING","HOLD","FOR_REVIEW","DCR_ISSUED","NOT_REQUIRED"].map((value) => <option key={value}>{value}</option>)}</select></div>
        {(status === "HOLD" || status === "FOR_REVIEW") ? <div className="space-y-1"><Label>{status === "HOLD" ? "Hold reason" : "Review reason"}</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div> : null}
        <div className="space-y-1 sm:col-span-2"><Label>Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        <Button onClick={updateStatus}>Save status</Button>
      </CardContent></Card> : null}
      {canAssign ? <Card><CardHeader><CardTitle className="text-base">Assignment</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row">
        <select className="h-10 flex-1 rounded-md border bg-white px-3" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><Button onClick={assign}>Assign</Button>
      </CardContent></Card> : null}
      <Card><CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader><CardContent className="space-y-3">{record.statusHistory.map((item) => <div key={item.id} className="border-l-2 border-emerald-200 pl-3 text-sm"><p className="font-medium">{item.toStatus.replaceAll("_", " ")}</p><p className="text-slate-500">{item.changedBy.name} · {new Date(item.changedAt).toLocaleString("en-IN")}</p>{item.remarks ? <p>{item.remarks}</p> : null}</div>)}</CardContent></Card>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
