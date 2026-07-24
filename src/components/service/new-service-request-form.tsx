"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatApiErrorMessage, parseApiJson, type ApiErrorPayload } from "@/lib/api-response";
import {
  SERVICE_COMPLAINT_SOURCE_LABELS,
  SERVICE_PRIORITY_LABELS,
  SERVICE_SYSTEM_STATUS_LABELS,
  formatServiceStatus,
} from "@/lib/service";
import {
  buildCreateServiceRequestPayload,
  defaultNewServiceRequestValues,
  validateNewServiceRequest,
  type NewServiceRequestErrors,
  type NewServiceRequestFormValues,
} from "@/lib/service-form";
import { ServicePriority, ServiceSystemStatus, type ServiceComplaintSource } from "@prisma/client";
import { cn } from "@/lib/utils";

type WorkTypeOption = { id: string; name: string };
type ExecutiveOption = { id: string; name: string; email: string };

type DuplicateMatch = {
  id: string;
  serviceRequestNumber: string;
  status: string;
  requestDate: string;
  customerName: string;
  workType: { name: string } | null;
  customWorkType: string | null;
};

type PreviousDetails = {
  customerName: string | null;
  mobileNumber: string | null;
  alternateMobileNumber: string | null;
  consumerNumber: string | null;
  installationAddress: string | null;
  cityOrVillage: string | null;
  landmark: string | null;
} | null;

const selectClass =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm max-md:min-h-11 max-md:text-base";

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-800"
      >
        {title}
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {open ? (
        <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2">{children}</div>
      ) : null}
    </div>
  );
}

export function NewServiceRequestForm({
  workTypes,
  executives,
}: {
  workTypes: WorkTypeOption[];
  executives: ExecutiveOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<NewServiceRequestFormValues>(
    defaultNewServiceRequestValues(),
  );
  const [errors, setErrors] = useState<NewServiceRequestErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [previousDetails, setPreviousDetails] = useState<PreviousDetails>(null);

  function setField<K extends keyof NewServiceRequestFormValues>(
    field: K,
    value: NewServiceRequestFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  const selectedWorkType = workTypes.find((wt) => wt.id === values.workTypeId);
  const isOtherWorkType = selectedWorkType?.name.toLowerCase() === "other";

  // Debounced duplicate / previous-details lookup within Service records only.
  const lookupKey = `${values.mobileNumber}|${values.consumerNumber}`;
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const mobile = values.mobileNumber.replace(/\D/g, "");
    const consumer = values.consumerNumber.trim();
    if (mobile.length < 10 && !consumer) {
      setDuplicates([]);
      setPreviousDetails(null);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const params = new URLSearchParams();
      if (mobile.length >= 10) params.set("mobileNumber", mobile);
      if (consumer) params.set("consumerNumber", consumer);
      try {
        const response = await fetch(`/api/service/duplicates?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await parseApiJson<{
          duplicates: DuplicateMatch[];
          previousDetails: PreviousDetails;
        }>(response);
        setDuplicates(data.duplicates ?? []);
        setPreviousDetails(data.previousDetails ?? null);
      } catch {
        // ignore aborted / network errors for this soft warning
      }
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey]);

  function usePreviousDetails() {
    if (!previousDetails) return;
    setValues((current) => ({
      ...current,
      customerName: previousDetails.customerName ?? current.customerName,
      alternateMobileNumber:
        previousDetails.alternateMobileNumber ?? current.alternateMobileNumber,
      installationAddress: previousDetails.installationAddress ?? current.installationAddress,
      cityOrVillage: previousDetails.cityOrVillage ?? current.cityOrVillage,
      landmark: previousDetails.landmark ?? current.landmark,
    }));
    setCustomerOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationErrors = validateNewServiceRequest(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setMessage("Please fix the highlighted fields.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateServiceRequestPayload(values)),
      });
      const data = await parseApiJson<ApiErrorPayload & { id?: string }>(response);

      if (!response.ok) {
        setMessage(formatApiErrorMessage(data, "Failed to create service request."));
        return;
      }

      if (data.id) {
        router.push(`/service/requests/${data.id}`);
      } else {
        router.push("/service/requests");
      }
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-24 md:pb-0">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">New Service Request</h1>
      </div>

      {duplicates.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Existing open service request(s) with this mobile / consumer number
            </div>
            <ul className="space-y-1 text-sm text-amber-900">
              {duplicates.map((dup) => (
                <li key={dup.id}>
                  <Link
                    href={`/service/requests/${dup.id}`}
                    className="font-medium underline"
                    target="_blank"
                  >
                    {dup.serviceRequestNumber}
                  </Link>{" "}
                  · {dup.customerName} · {dup.workType?.name ?? dup.customWorkType ?? "—"} ·{" "}
                  {formatServiceStatus(dup.status as never)}
                </li>
              ))}
            </ul>
            {previousDetails ? (
              <Button type="button" variant="outline" size="sm" onClick={usePreviousDetails}>
                Use previous details
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2 md:p-6">
          <Field
            label="Customer Name"
            htmlFor="customerName"
            required
            error={errors.customerName}
            className="md:col-span-2"
          >
            <Input
              id="customerName"
              value={values.customerName}
              onChange={(e) => setField("customerName", e.target.value)}
            />
          </Field>

          <Field label="Mobile Number" htmlFor="mobileNumber" required error={errors.mobileNumber}>
            <Input
              id="mobileNumber"
              inputMode="numeric"
              value={values.mobileNumber}
              onChange={(e) =>
                setField("mobileNumber", e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10-digit mobile"
            />
          </Field>

          <Field label="Consumer Number" htmlFor="consumerNumber" error={errors.consumerNumber}>
            <Input
              id="consumerNumber"
              value={values.consumerNumber}
              onChange={(e) => setField("consumerNumber", e.target.value)}
            />
          </Field>

          <Field label="Work Type" htmlFor="workTypeId" required error={errors.workTypeId}>
            <select
              id="workTypeId"
              className={selectClass}
              value={values.workTypeId}
              onChange={(e) => setField("workTypeId", e.target.value)}
            >
              <option value="">Select work type</option>
              {workTypes.map((wt) => (
                <option key={wt.id} value={wt.id}>
                  {wt.name}
                </option>
              ))}
            </select>
          </Field>

          {isOtherWorkType ? (
            <Field
              label="Specify Work Type"
              htmlFor="customWorkType"
              error={errors.customWorkType}
            >
              <Input
                id="customWorkType"
                value={values.customWorkType}
                onChange={(e) => setField("customWorkType", e.target.value)}
              />
            </Field>
          ) : null}

          <Field
            label="Customer Request / Complaint"
            htmlFor="customerRequest"
            required
            error={errors.customerRequest}
            className="md:col-span-2"
          >
            <textarea
              id="customerRequest"
              className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm max-md:text-base"
              value={values.customerRequest}
              onChange={(e) => setField("customerRequest", e.target.value)}
            />
          </Field>

          <Field label="Priority" htmlFor="priority">
            <select
              id="priority"
              className={selectClass}
              value={values.priority}
              onChange={(e) => setField("priority", e.target.value as ServicePriority)}
            >
              {Object.entries(SERVICE_PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assign To" htmlFor="assignedToUserId">
            <select
              id="assignedToUserId"
              className={selectClass}
              value={values.assignedToUserId}
              onChange={(e) => setField("assignedToUserId", e.target.value)}
            >
              <option value="">Unassigned</option>
              {executives.map((exec) => (
                <option key={exec.id} value={exec.id}>
                  {exec.name}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <CollapsibleSection
        title="Add Customer Details"
        open={customerOpen}
        onToggle={() => setCustomerOpen((v) => !v)}
      >
        <Field
          label="Alternate Mobile Number"
          htmlFor="alternateMobileNumber"
          error={errors.alternateMobileNumber}
        >
          <Input
            id="alternateMobileNumber"
            inputMode="numeric"
            value={values.alternateMobileNumber}
            onChange={(e) =>
              setField("alternateMobileNumber", e.target.value.replace(/\D/g, "").slice(0, 10))
            }
          />
        </Field>
        <Field label="Village or City" htmlFor="cityOrVillage">
          <Input
            id="cityOrVillage"
            value={values.cityOrVillage}
            onChange={(e) => setField("cityOrVillage", e.target.value)}
          />
        </Field>
        <Field label="Installation Address" htmlFor="installationAddress" className="md:col-span-2">
          <textarea
            id="installationAddress"
            className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm max-md:text-base"
            value={values.installationAddress}
            onChange={(e) => setField("installationAddress", e.target.value)}
          />
        </Field>
        <Field label="Landmark" htmlFor="landmark" className="md:col-span-2">
          <Input
            id="landmark"
            value={values.landmark}
            onChange={(e) => setField("landmark", e.target.value)}
          />
        </Field>
      </CollapsibleSection>

      <CollapsibleSection
        title="Add More Details"
        open={moreOpen}
        onToggle={() => setMoreOpen((v) => !v)}
      >
        <Field label="Target Completion Date" htmlFor="targetCompletionDate">
          <Input
            id="targetCompletionDate"
            type="date"
            value={values.targetCompletionDate}
            onChange={(e) => setField("targetCompletionDate", e.target.value)}
          />
        </Field>
        <Field label="Complaint Source" htmlFor="complaintSource">
          <select
            id="complaintSource"
            className={selectClass}
            value={values.complaintSource}
            onChange={(e) =>
              setField("complaintSource", e.target.value as ServiceComplaintSource | "")
            }
          >
            <option value="">Not specified</option>
            {Object.entries(SERVICE_COMPLAINT_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="System Status" htmlFor="systemStatus">
          <select
            id="systemStatus"
            className={selectClass}
            value={values.systemStatus}
            onChange={(e) => setField("systemStatus", e.target.value as ServiceSystemStatus)}
          >
            {Object.entries(SERVICE_SYSTEM_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Total Fees" htmlFor="totalFees" error={errors.totalFees}>
          <Input
            id="totalFees"
            inputMode="decimal"
            value={values.totalFees}
            onChange={(e) => setField("totalFees", e.target.value)}
            placeholder="0"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={values.isChargeable}
            onChange={(e) => setField("isChargeable", e.target.checked)}
          />
          Service is chargeable
        </label>
        <Field label="Internal Note" htmlFor="internalNote" className="md:col-span-2">
          <textarea
            id="internalNote"
            className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm max-md:text-base"
            value={values.internalNote}
            onChange={(e) => setField("internalNote", e.target.value)}
          />
        </Field>
        <Field label="Attachment URL" htmlFor="attachmentUrl">
          <Input
            id="attachmentUrl"
            value={values.attachmentUrl}
            onChange={(e) => setField("attachmentUrl", e.target.value)}
            placeholder="Link to a photo or document"
          />
        </Field>
        <Field label="Attachment Name" htmlFor="attachmentName">
          <Input
            id="attachmentName"
            value={values.attachmentName}
            onChange={(e) => setField("attachmentName", e.target.value)}
          />
        </Field>
      </CollapsibleSection>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-slate-200 bg-white p-4 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" disabled={loading} className="flex-1 md:flex-none">
          {loading ? "Creating..." : "Create Service Request"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/service/requests">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
