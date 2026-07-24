"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceStatus, ServiceWaitingReason } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { formatApiErrorMessage, parseApiJson, type ApiErrorPayload } from "@/lib/api-response";
import {
  SERVICE_WAITING_REASON_LABELS,
  formatServiceStatus,
  getManualNextServiceStatuses,
  statusRequiresNote,
  statusRequiresWaitingReason,
} from "@/lib/service";

const selectClass =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm max-md:min-h-11 max-md:text-base";
const textareaClass =
  "min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm max-md:text-base";

type ExecutiveOption = { id: string; name: string };

export type ServiceActionPermissions = {
  canAssign: boolean;
  canUpdateStatus: boolean;
};

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
  const [openModal, setOpenModal] = useState<null | "assign" | "status">(null);
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

  const showAssign = permissions.canAssign;
  const showStatus = permissions.canUpdateStatus && manualStatuses.length > 0;

  if (!showAssign && !showStatus) return null;

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-2 p-4">
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
    </Card>
  );
}
