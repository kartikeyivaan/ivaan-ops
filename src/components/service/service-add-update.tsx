"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ServiceUpdateType, type ServiceContactMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { formatApiErrorMessage, parseApiJson, type ApiErrorPayload } from "@/lib/api-response";
import {
  SERVICE_CONTACT_MODE_LABELS,
  SERVICE_UPDATE_TYPE_LABELS,
  SERVICE_USER_UPDATE_TYPES,
} from "@/lib/service";

const selectClass =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm max-md:min-h-11 max-md:text-base";
const textareaClass =
  "min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm max-md:text-base";

type ExecutiveOption = { id: string; name: string };

export function ServiceAddUpdate({
  requestId,
  executives,
}: {
  requestId: string;
  executives: ExecutiveOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [updateType, setUpdateType] = useState<ServiceUpdateType>(
    ServiceUpdateType.GENERAL_NOTE,
  );
  const [note, setNote] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [contactMode, setContactMode] = useState<ServiceContactMode | "">("");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [assignedExecutiveId, setAssignedExecutiveId] = useState("");
  const [visitResult, setVisitResult] = useState("");
  const [furtherWorkRequired, setFurtherWorkRequired] = useState(false);
  const [materialDetails, setMaterialDetails] = useState("");

  function reset() {
    setUpdateType(ServiceUpdateType.GENERAL_NOTE);
    setNote("");
    setNextActionDate("");
    setAttachmentUrl("");
    setAttachmentName("");
    setContactMode("");
    setVisitDate("");
    setVisitTime("");
    setAssignedExecutiveId("");
    setVisitResult("");
    setFurtherWorkRequired(false);
    setMaterialDetails("");
    setError(null);
  }

  function clientValidate(): string | null {
    if (updateType === ServiceUpdateType.CUSTOMER_CONTACTED && !contactMode) {
      return "Select a contact mode.";
    }
    if (updateType === ServiceUpdateType.VISIT_SCHEDULED) {
      if (!visitDate) return "Select a visit date.";
      if (!assignedExecutiveId) return "Select the executive for the visit.";
    }
    if (updateType === ServiceUpdateType.SITE_VISIT_COMPLETED && !visitResult.trim()) {
      return "Enter the visit result.";
    }
    if (updateType === ServiceUpdateType.MATERIAL_REQUIRED && !materialDetails.trim()) {
      return "Enter the material details.";
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = clientValidate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: Record<string, unknown> = { updateType };
    if (note.trim()) payload.note = note.trim();
    if (nextActionDate) payload.nextActionDate = nextActionDate;
    if (attachmentUrl.trim()) payload.attachmentUrl = attachmentUrl.trim();
    if (attachmentName.trim()) payload.attachmentName = attachmentName.trim();

    if (updateType === ServiceUpdateType.CUSTOMER_CONTACTED) {
      payload.contactMode = contactMode;
    }
    if (updateType === ServiceUpdateType.VISIT_SCHEDULED) {
      payload.visitDate = visitDate;
      payload.assignedExecutiveId = assignedExecutiveId;
      if (visitTime.trim()) payload.visitTime = visitTime.trim();
    }
    if (updateType === ServiceUpdateType.SITE_VISIT_COMPLETED) {
      payload.visitResult = visitResult.trim();
      payload.furtherWorkRequired = furtherWorkRequired;
    }
    if (updateType === ServiceUpdateType.MATERIAL_REQUIRED) {
      payload.materialDetails = materialDetails.trim();
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/service/${requestId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson<ApiErrorPayload>(response);
      if (!response.ok) {
        setError(formatApiErrorMessage(data, "Failed to add update."));
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
        Add Update
      </Button>

      {open ? (
        <Modal onClose={() => setOpen(false)} size="md">
          <ModalForm onSubmit={handleSubmit}>
            <ModalHeader title="Add Update" onClose={() => setOpen(false)} />
            <ModalBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="updateType">Update Type</Label>
                <select
                  id="updateType"
                  className={selectClass}
                  value={updateType}
                  onChange={(e) => setUpdateType(e.target.value as ServiceUpdateType)}
                >
                  {SERVICE_USER_UPDATE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SERVICE_UPDATE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              {updateType === ServiceUpdateType.CUSTOMER_CONTACTED ? (
                <div className="space-y-2">
                  <Label htmlFor="contactMode">
                    Contact Mode<span className="ml-0.5 text-red-600">*</span>
                  </Label>
                  <select
                    id="contactMode"
                    className={selectClass}
                    value={contactMode}
                    onChange={(e) => setContactMode(e.target.value as ServiceContactMode | "")}
                  >
                    <option value="">Select mode</option>
                    {Object.entries(SERVICE_CONTACT_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {updateType === ServiceUpdateType.VISIT_SCHEDULED ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="visitDate">
                      Visit Date<span className="ml-0.5 text-red-600">*</span>
                    </Label>
                    <Input
                      id="visitDate"
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visitTime">Visit Time</Label>
                    <Input
                      id="visitTime"
                      value={visitTime}
                      onChange={(e) => setVisitTime(e.target.value)}
                      placeholder="e.g. 11:00 AM"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="assignedExecutiveId">
                      Assigned Executive<span className="ml-0.5 text-red-600">*</span>
                    </Label>
                    <select
                      id="assignedExecutiveId"
                      className={selectClass}
                      value={assignedExecutiveId}
                      onChange={(e) => setAssignedExecutiveId(e.target.value)}
                    >
                      <option value="">Select executive</option>
                      {executives.map((exec) => (
                        <option key={exec.id} value={exec.id}>
                          {exec.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              {updateType === ServiceUpdateType.SITE_VISIT_COMPLETED ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="visitResult">
                      Visit Result<span className="ml-0.5 text-red-600">*</span>
                    </Label>
                    <textarea
                      id="visitResult"
                      className={textareaClass}
                      value={visitResult}
                      onChange={(e) => setVisitResult(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={furtherWorkRequired}
                      onChange={(e) => setFurtherWorkRequired(e.target.checked)}
                    />
                    Further work required
                  </label>
                </>
              ) : null}

              {updateType === ServiceUpdateType.MATERIAL_REQUIRED ? (
                <div className="space-y-2">
                  <Label htmlFor="materialDetails">
                    Material Details<span className="ml-0.5 text-red-600">*</span>
                  </Label>
                  <textarea
                    id="materialDetails"
                    className={textareaClass}
                    value={materialDetails}
                    onChange={(e) => setMaterialDetails(e.target.value)}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <textarea
                  id="note"
                  className={textareaClass}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nextActionDate">Next Action Date</Label>
                  <Input
                    id="nextActionDate"
                    type="date"
                    value={nextActionDate}
                    onChange={(e) => setNextActionDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="attachmentUrl">
                    {updateType === ServiceUpdateType.SITE_VISIT_COMPLETED
                      ? "Photo URL"
                      : "Attachment URL"}
                  </Label>
                  <Input
                    id="attachmentUrl"
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="Link to a photo or document"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attachmentName">Attachment Name</Label>
                  <Input
                    id="attachmentName"
                    value={attachmentName}
                    onChange={(e) => setAttachmentName(e.target.value)}
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </ModalBody>
            <ModalFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Add Update"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}
    </>
  );
}
