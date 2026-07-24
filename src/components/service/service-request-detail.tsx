"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, MessageCircle, Phone } from "lucide-react";
import type {
  ServiceComplaintSource,
  ServiceCompletionSystemStatus,
  ServiceCustomerConfirmation,
  ServicePaymentMode,
  ServicePriority,
  ServiceStatus,
  ServiceSystemStatus,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SERVICE_COMPLAINT_SOURCE_LABELS,
  SERVICE_COMPLETION_SYSTEM_STATUS_LABELS,
  SERVICE_CUSTOMER_CONFIRMATION_LABELS,
  SERVICE_PAYMENT_MODE_LABELS,
  SERVICE_SYSTEM_STATUS_LABELS,
  formatServicePriority,
  formatServiceStatus,
  servicePriorityBadgeVariant,
  serviceStatusBadgeVariant,
} from "@/lib/service";
import { formatDate, formatDocumentDate } from "@/lib/utils";
import { normalizeMobileNumber } from "@/lib/service";
import { ServiceTimeline, type ServiceTimelineEntry } from "@/components/service/service-timeline";
import {
  ServiceRequestActions,
  type ServiceActionPermissions,
} from "@/components/service/service-request-actions";

type NamedUser = { id: string; name: string; email?: string } | null;

export type ServiceRequestDetail = {
  id: string;
  serviceRequestNumber: string;
  customerName: string;
  mobileNumber: string | null;
  alternateMobileNumber: string | null;
  consumerNumber: string | null;
  installationAddress: string | null;
  cityOrVillage: string | null;
  landmark: string | null;
  workType: { id: string; name: string } | null;
  customWorkType: string | null;
  customerRequest: string;
  priority: ServicePriority;
  status: ServiceStatus;
  systemStatus: ServiceSystemStatus;
  complaintSource: ServiceComplaintSource | null;
  assignedTo: NamedUser;
  createdBy: NamedUser;
  requestDate: string;
  targetCompletionDate: string | null;
  nextActionDate: string | null;
  internalNote: string | null;
  isChargeable: boolean;
  totalFees: number;
  amountReceived: number;
  pendingAmount: number;
  completionDate: string | null;
  completionNotes: string | null;
  systemStatusAfterWork: ServiceCompletionSystemStatus | null;
  customerConfirmation: ServiceCustomerConfirmation | null;
  furtherWorkRequired: boolean;
  cancellationReason: string | null;
  reopenedReason: string | null;
  delayDays: number;
  delayStatus: "ON_TRACK" | "DUE_TODAY" | "DELAYED" | null;
  createdAt: string;
  updatedAt: string;
  payments: {
    id: string;
    amount: number;
    paymentMode: ServicePaymentMode;
    paymentDate: string;
    reference: string | null;
    recordedBy: NamedUser;
    createdAt: string;
  }[];
  attachments: {
    id: string;
    fileUrl: string;
    fileName: string | null;
    createdAt: string;
    uploadedBy: NamedUser;
  }[];
  updates: ServiceTimelineEntry[];
};

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function DelayBadge({ request }: { request: ServiceRequestDetail }) {
  if (request.delayStatus === "DELAYED") {
    return <Badge variant="danger">{request.delayDays}d late</Badge>;
  }
  if (request.delayStatus === "DUE_TODAY") {
    return <Badge variant="warning">Due today</Badge>;
  }
  if (request.delayStatus === "ON_TRACK") {
    return <Badge variant="success">On track</Badge>;
  }
  return null;
}

export function ServiceRequestDetailView({
  request,
  executives,
  permissions,
}: {
  request: ServiceRequestDetail;
  executives: { id: string; name: string }[];
  permissions: ServiceActionPermissions;
}) {
  const [copied, setCopied] = useState(false);
  const workTypeName = request.workType?.name ?? request.customWorkType ?? "—";
  const mobile = request.mobileNumber ? normalizeMobileNumber(request.mobileNumber) : "";

  const visits = request.updates.filter(
    (u) => u.updateType === "VISIT_SCHEDULED" || u.updateType === "SITE_VISIT_COMPLETED",
  );

  const showCompletion =
    request.status === "COMPLETED" ||
    request.status === "CLOSED" ||
    Boolean(request.completionDate);

  const showPayment = request.isChargeable || request.payments.length > 0;

  async function copyMobile() {
    if (!request.mobileNumber) return;
    try {
      await navigator.clipboard.writeText(request.mobileNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/service/requests" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to requests
        </Link>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="space-y-3 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">{request.serviceRequestNumber}</p>
              <h1 className="text-xl font-semibold text-slate-900">{request.customerName}</h1>
              <p className="text-sm text-slate-600">{workTypeName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={serviceStatusBadgeVariant(request.status)}>
                {formatServiceStatus(request.status)}
              </Badge>
              <Badge variant={servicePriorityBadgeVariant(request.priority)}>
                {formatServicePriority(request.priority)}
              </Badge>
              <DelayBadge request={request} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>Assigned: {request.assignedTo?.name ?? "Unassigned"}</span>
            <span>Logged: {formatDocumentDate(request.requestDate)}</span>
            {request.targetCompletionDate ? (
              <span>Target: {formatDocumentDate(request.targetCompletionDate)}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ServiceRequestActions
        request={{
          id: request.id,
          status: request.status,
          assignedTo: request.assignedTo
            ? { id: request.assignedTo.id, name: request.assignedTo.name }
            : null,
          targetCompletionDate: request.targetCompletionDate,
        }}
        executives={executives}
        permissions={permissions}
      />

      {/* Customer + quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {request.mobileNumber ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${mobile}`}>
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`https://wa.me/91${mobile}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={copyMobile}>
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy Number"}
              </Button>
            </div>
          ) : null}
          <dl className="grid gap-4 md:grid-cols-2">
            <InfoRow label="Mobile Number" value={request.mobileNumber ?? "—"} />
            <InfoRow label="Consumer Number" value={request.consumerNumber ?? "—"} />
            <InfoRow
              label="Alternate Mobile"
              value={request.alternateMobileNumber ?? "—"}
            />
            <InfoRow label="Village / City" value={request.cityOrVillage ?? "—"} />
            <InfoRow
              label="Installation Address"
              value={request.installationAddress ?? "—"}
            />
            <InfoRow label="Landmark" value={request.landmark ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      {/* Request Details */}
      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow
            label="Customer Request / Complaint"
            value={<span className="whitespace-pre-wrap">{request.customerRequest}</span>}
          />
          <dl className="grid gap-4 md:grid-cols-2">
            <InfoRow label="Work Type" value={workTypeName} />
            <InfoRow label="Priority" value={formatServicePriority(request.priority)} />
            <InfoRow
              label="System Status"
              value={SERVICE_SYSTEM_STATUS_LABELS[request.systemStatus]}
            />
            <InfoRow
              label="Complaint Source"
              value={
                request.complaintSource
                  ? SERVICE_COMPLAINT_SOURCE_LABELS[request.complaintSource]
                  : "—"
              }
            />
            <InfoRow label="Logged By" value={request.createdBy?.name ?? "—"} />
            <InfoRow label="Chargeable" value={request.isChargeable ? "Yes" : "No"} />
          </dl>
          {request.internalNote ? (
            <InfoRow
              label="Internal Note"
              value={<span className="whitespace-pre-wrap">{request.internalNote}</span>}
            />
          ) : null}
          {request.cancellationReason ? (
            <InfoRow label="Cancellation Reason" value={request.cancellationReason} />
          ) : null}
          {request.reopenedReason ? (
            <InfoRow label="Reopen Reason" value={request.reopenedReason} />
          ) : null}
        </CardContent>
      </Card>

      {/* Completion */}
      {showCompletion ? (
        <Card>
          <CardHeader>
            <CardTitle>Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 md:grid-cols-2">
              <InfoRow
                label="Completion Date"
                value={
                  request.completionDate ? formatDocumentDate(request.completionDate) : "—"
                }
              />
              <InfoRow
                label="System Status After Work"
                value={
                  request.systemStatusAfterWork
                    ? SERVICE_COMPLETION_SYSTEM_STATUS_LABELS[request.systemStatusAfterWork]
                    : "—"
                }
              />
              <InfoRow
                label="Customer Confirmation"
                value={
                  request.customerConfirmation
                    ? SERVICE_CUSTOMER_CONFIRMATION_LABELS[request.customerConfirmation]
                    : "—"
                }
              />
              <InfoRow
                label="Further Work Required"
                value={request.furtherWorkRequired ? "Yes" : "No"}
              />
              {request.completionNotes ? (
                <div className="md:col-span-2">
                  <InfoRow
                    label="Work Completed"
                    value={
                      <span className="whitespace-pre-wrap">{request.completionNotes}</span>
                    }
                  />
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {/* Payment */}
      {showPayment ? (
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 md:grid-cols-3">
              <InfoRow label="Total Fees" value={money(request.totalFees)} />
              <InfoRow label="Received" value={money(request.amountReceived)} />
              <InfoRow
                label="Pending"
                value={
                  <span className={request.pendingAmount > 0 ? "text-red-600" : undefined}>
                    {money(request.pendingAmount)}
                  </span>
                }
              />
            </dl>
            {request.payments.length > 0 ? (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {request.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">{money(payment.amount)}</span>
                    <span className="text-slate-500">
                      {SERVICE_PAYMENT_MODE_LABELS[payment.paymentMode]} ·{" "}
                      {formatDocumentDate(payment.paymentDate)}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No payments recorded yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Visits */}
      {visits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceTimeline entries={visits} />
          </CardContent>
        </Card>
      ) : null}

      {/* Attachments */}
      {request.attachments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {request.attachments.map((att) => (
                <li key={att.id} className="text-sm">
                  <a
                    href={att.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 underline"
                  >
                    {att.fileName ?? att.fileUrl}
                  </a>
                  <span className="text-slate-400">
                    {" "}
                    · {formatDate(att.createdAt)} · {att.uploadedBy?.name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceTimeline entries={request.updates} />
        </CardContent>
      </Card>
    </div>
  );
}
