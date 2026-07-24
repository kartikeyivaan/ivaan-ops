"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ServiceStatus } from "@prisma/client";
import type {
  ServiceCompletionSystemStatus,
  ServiceCustomerConfirmation,
  ServiceWaitingReason,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { formatApiErrorMessage, parseApiJson, type ApiErrorPayload } from "@/lib/api-response";
import {
  SERVICE_COMPLETION_SYSTEM_STATUS_LABELS,
  SERVICE_CUSTOMER_CONFIRMATION_LABELS,
  SERVICE_WAITING_REASON_LABELS,
  formatServiceStatus,
  getManualNextServiceStatuses,
  isValidServiceStatusTransition,
  statusRequiresNote,
  statusRequiresWaitingReason,
} from "@/lib/service";
import { ServiceAddUpdate } from "@/components/service/service-add-update";

const selectClass =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm max-md:min-h-11 max-md:text-base";
const textareaClass =
  "min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm max-md:text-base";

type ExecutiveOption = { id: string; name: string };

export type ServiceActionPermissions = {
  canAssign: boolean;
  canUpdateStatus: boolean;
  canAddUpdate: boolean;
  canComplete: boolean;
  canClose: boolean;
  canReopen: boolean;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ActionRequest = {
  id: string;
  status: ServiceStatus;
  assignedTo: { id: string; name: string } | null;
  targetCompletionDate: string | null;
};

export function ServiceRequestActions({
  request,
  executives,
  permissions,
}: {
  request: ActionRequest;
  executives: ExecutiveOption[];
  permissions: ServiceActionPermissions;
}) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<
    null | "assign" | "status" | "complete" | "close" | "reopen"
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assign form state
  const [assignee, setAssignee] = useState(request.assignedTo?.id ?? "");
  const [assignTarget, setAssignTarget] = useState(
    request.targetCompletionDate ? request.targetCompletionDate.slice(0, 10) : "",
  );
  const [assignNote, setAssignNote] = useState("");

  // Status form state
  const manualStatuses = getManualNextServiceStatuses(request.status);
  const [status, setStatus] = useState<ServiceStatus | "">("");
  const [waitingReason, setWaitingReason] = useState<ServiceWaitingReason | "">("");
  const [statusNote, setStatusNote] = useState("");
  const [statusNextAction, setStatusNextAction] = useState("");

  // Completion form state
  const [workCompleted, setWorkCompleted] = useState("");
  const [completionDate, setCompletionDate] = useState(today());
  const [systemStatusAfterWork, setSystemStatusAfterWork] = useState<
    ServiceCompletionSystemStatus | ""
  >("");
  const [customerConfirmation, setCustomerConfirmation] = useState<
    ServiceCustomerConfirmation | ""
  >("");
  const [completionFurtherWork, setCompletionFurtherWork] = useState(false);
  const [completionAttachmentUrl, setCompletionAttachmentUrl] = useState("");
  const [completionAttachmentName, setCompletionAttachmentName] = useState("");

  // Close / reopen form state
  const [closeNote, setCloseNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  function closeModal() {
    setOpenModal(null);
    setError(null);
  }

  async function submit(url: string, payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson<ApiErrorPayload>(response);
      if (!response.ok) {
        setError(formatApiErrorMessage(data, "Action failed."));
        return false;
      }
      closeModal();
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    await submit(`/api/service/${request.id}/assign`, {
      assignedToUserId: assignee || null,
      targetCompletionDate: assignTarget || null,
      note: assignNote || undefined,
    });
  }

  async function handleStatus(event: React.FormEvent) {
    event.preventDefault();
    if (!status) {
      setError("Select a status.");
      return;
    }
    if (statusRequiresNote(status) && !statusNote.trim()) {
      setError("A note is required for this status.");
      return;
    }
    if (statusRequiresWaitingReason(status) && !waitingReason) {
      setError("Select a waiting reason.");
      return;
    }
    await submit(`/api/service/${request.id}/status`, {
      status,
      note: statusNote || undefined,
      waitingReason: statusRequiresWaitingReason(status) ? waitingReason || undefined : undefined,
      nextActionDate: statusNextAction || undefined,
    });
  }

  async function handleComplete(event: React.FormEvent) {
    event.preventDefault();
    if (!workCompleted.trim()) {
      setError("Describe the work completed.");
      return;
    }
    if (!completionDate) {
      setError("Select a completion date.");
      return;
    }
    if (!completionFurtherWork && !systemStatusAfterWork) {
      setError("Select the system status after work.");
      return;
    }
    await submit(`/api/service/${request.id}/complete`, {
      workCompleted: workCompleted.trim(),
      completionDate,
      systemStatusAfterWork: systemStatusAfterWork || "NOT_APPLICABLE",
      customerConfirmation: customerConfirmation || undefined,
      furtherWorkRequired: completionFurtherWork,
      attachmentUrl: completionAttachmentUrl || undefined,
      attachmentName: completionAttachmentName || undefined,
    });
  }

  async function handleClose(event: React.FormEvent) {
    event.preventDefault();
    await submit(`/api/service/${request.id}/close`, {
      note: closeNote || undefined,
    });
  }

  async function handleReopen(event: React.FormEvent) {
    event.preventDefault();
    if (!reopenReason.trim()) {
      setError("A reason is required to reopen.");
      return;
    }
    await submit(`/api/service/${request.id}/reopen`, {
      reason: reopenReason.trim(),
    });
  }

  const showAssign = permissions.canAssign;
  const showStatus = permissions.canUpdateStatus && manualStatuses.length > 0;
  const showAddUpdate = permissions.canAddUpdate;
  const showComplete =
    permissions.canComplete &&
    isValidServiceStatusTransition(request.status, ServiceStatus.COMPLETED);
  const showClose =
    permissions.canClose &&
    isValidServiceStatusTransition(request.status, ServiceStatus.CLOSED);
  const showReopen =
    permissions.canReopen &&
    isValidServiceStatusTransition(request.status, ServiceStatus.REOPENED);

  if (
    !showAssign &&
    !showStatus &&
    !showAddUpdate &&
    !showComplete &&
    !showClose &&
    !showReopen
  ) {
    return null;
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-2 p-4">
        {showAddUpdate ? (
          <ServiceAddUpdate requestId={request.id} executives={executives} />
        ) : null}
        {showComplete ? (
          <Button
            type="button"
            onClick={() => {
              setWorkCompleted("");
              setCompletionDate(today());
              setSystemStatusAfterWork("");
              setCustomerConfirmation("");
              setCompletionFurtherWork(false);
              setCompletionAttachmentUrl("");
              setCompletionAttachmentName("");
              setError(null);
              setOpenModal("complete");
            }}
          >
            Complete Work
          </Button>
        ) : null}
        {showClose ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCloseNote("");
              setError(null);
              setOpenModal("close");
            }}
          >
            Close
          </Button>
        ) : null}
        {showReopen ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setReopenReason("");
              setError(null);
              setOpenModal("reopen");
            }}
          >
            Reopen
          </Button>
        ) : null}
        {showAssign ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAssignee(request.assignedTo?.id ?? "");
              setAssignTarget(
                request.targetCompletionDate
                  ? request.targetCompletionDate.slice(0, 10)
                  : "",
              );
              setAssignNote("");
              setError(null);
              setOpenModal("assign");
            }}
          >
            {request.assignedTo ? "Reassign" : "Assign"}
          </Button>
        ) : null}
        {showStatus ? (
          <Button
            type="button"
            onClick={() => {
              setStatus("");
              setWaitingReason("");
              setStatusNote("");
              setStatusNextAction("");
              setError(null);
              setOpenModal("status");
            }}
          >
            Change Status
          </Button>
        ) : null}
      </CardContent>

      {openModal === "assign" ? (
        <Modal onClose={closeModal} size="sm">
          <ModalForm onSubmit={handleAssign}>
            <ModalHeader
              title={request.assignedTo ? "Reassign Request" : "Assign Request"}
              onClose={closeModal}
            />
            <ModalBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assignee">Assign To</Label>
                <select
                  id="assignee"
                  className={selectClass}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {executives.map((exec) => (
                    <option key={exec.id} value={exec.id}>
                      {exec.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignTarget">Target Completion Date</Label>
                <Input
                  id="assignTarget"
                  type="date"
                  value={assignTarget}
                  onChange={(e) => setAssignTarget(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignNote">Note</Label>
                <textarea
                  id="assignNote"
                  className={textareaClass}
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </ModalBody>
            <ModalFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}

      {openModal === "status" ? (
        <Modal onClose={closeModal} size="sm">
          <ModalForm onSubmit={handleStatus}>
            <ModalHeader title="Change Status" onClose={closeModal} />
            <ModalBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">New Status</Label>
                <select
                  id="status"
                  className={selectClass}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ServiceStatus | "")}
                >
                  <option value="">Select status</option>
                  {manualStatuses.map((next) => (
                    <option key={next} value={next}>
                      {formatServiceStatus(next)}
                    </option>
                  ))}
                </select>
              </div>
              {status && statusRequiresWaitingReason(status) ? (
                <div className="space-y-2">
                  <Label htmlFor="waitingReason">Waiting Reason</Label>
                  <select
                    id="waitingReason"
                    className={selectClass}
                    value={waitingReason}
                    onChange={(e) => setWaitingReason(e.target.value as ServiceWaitingReason | "")}
                  >
                    <option value="">Select reason</option>
                    {Object.entries(SERVICE_WAITING_REASON_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="statusNote">
                  Note
                  {status && statusRequiresNote(status) ? (
                    <span className="ml-0.5 text-red-600">*</span>
                  ) : null}
                </Label>
                <textarea
                  id="statusNote"
                  className={textareaClass}
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="statusNextAction">Next Action Date</Label>
                <Input
                  id="statusNextAction"
                  type="date"
                  value={statusNextAction}
                  onChange={(e) => setStatusNextAction(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </ModalBody>
            <ModalFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Update Status"}
              </Button>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}

      {openModal === "complete" ? (
        <Modal onClose={closeModal} size="md">
          <ModalForm onSubmit={handleComplete}>
            <ModalHeader title="Complete Work" onClose={closeModal} />
            <ModalBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workCompleted">
                  Work Completed<span className="ml-0.5 text-red-600">*</span>
                </Label>
                <textarea
                  id="workCompleted"
                  className={textareaClass}
                  value={workCompleted}
                  onChange={(e) => setWorkCompleted(e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="completionDate">
                    Completion Date<span className="ml-0.5 text-red-600">*</span>
                  </Label>
                  <Input
                    id="completionDate"
                    type="date"
                    value={completionDate}
                    onChange={(e) => setCompletionDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="systemStatusAfterWork">
                    System Status After Work
                    {completionFurtherWork ? null : (
                      <span className="ml-0.5 text-red-600">*</span>
                    )}
                  </Label>
                  <select
                    id="systemStatusAfterWork"
                    className={selectClass}
                    value={systemStatusAfterWork}
                    onChange={(e) =>
                      setSystemStatusAfterWork(
                        e.target.value as ServiceCompletionSystemStatus | "",
                      )
                    }
                  >
                    <option value="">Select status</option>
                    {Object.entries(SERVICE_COMPLETION_SYSTEM_STATUS_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerConfirmation">Customer Confirmation</Label>
                <select
                  id="customerConfirmation"
                  className={selectClass}
                  value={customerConfirmation}
                  onChange={(e) =>
                    setCustomerConfirmation(e.target.value as ServiceCustomerConfirmation | "")
                  }
                >
                  <option value="">Not specified</option>
                  {Object.entries(SERVICE_CUSTOMER_CONFIRMATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={completionFurtherWork}
                  onChange={(e) => setCompletionFurtherWork(e.target.checked)}
                />
                Further work required (keeps the request open)
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="completionAttachmentUrl">Completion Photo URL</Label>
                  <Input
                    id="completionAttachmentUrl"
                    value={completionAttachmentUrl}
                    onChange={(e) => setCompletionAttachmentUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="completionAttachmentName">Attachment Name</Label>
                  <Input
                    id="completionAttachmentName"
                    value={completionAttachmentName}
                    onChange={(e) => setCompletionAttachmentName(e.target.value)}
                  />
                </div>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </ModalBody>
            <ModalFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Complete Work"}
              </Button>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}

      {openModal === "close" ? (
        <Modal onClose={closeModal} size="sm">
          <ModalForm onSubmit={handleClose}>
            <ModalHeader title="Close Request" onClose={closeModal} />
            <ModalBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="closeNote">Note</Label>
                <textarea
                  id="closeNote"
                  className={textareaClass}
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </ModalBody>
            <ModalFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Close Request"}
              </Button>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}

      {openModal === "reopen" ? (
        <Modal onClose={closeModal} size="sm">
          <ModalForm onSubmit={handleReopen}>
            <ModalHeader title="Reopen Request" onClose={closeModal} />
            <ModalBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reopenReason">
                  Reason<span className="ml-0.5 text-red-600">*</span>
                </Label>
                <textarea
                  id="reopenReason"
                  className={textareaClass}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </ModalBody>
            <ModalFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Reopen Request"}
              </Button>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}
    </Card>
  );
}
