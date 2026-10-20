"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DocGenFieldInput,
  type DocGenFormField,
} from "@/components/document-generator/doc-gen-field-input";
import { prefillFieldValuesFromCustomerSource } from "@/lib/doc-gen-customer-prefill";
import { formatDocGenDateDisplay } from "@/lib/doc-gen-date";

type PublishedSet = {
  id: string;
  name: string;
  description: string | null;
};

type SearchHit = {
  profiles: Array<{
    id: string;
    displayName: string;
    mobileNumber: string | null;
    consumerNumber: string | null;
    fieldValuesJson: Record<string, string>;
  }>;
  services: Array<{
    id: string;
    serviceRequestNumber: string;
    customerName: string;
    mobileNumber: string | null;
    consumerNumber: string | null;
    installationAddress: string | null;
    cityOrVillage: string | null;
  }>;
  customers: Array<{
    id: string;
    customerCode: string;
    customerName: string;
    mobile: string | null;
    address: string | null;
    city: string | null;
  }>;
};

type GenerationResult = {
  id: string;
  status: string;
  errorMessage: string | null;
  combinedStoredPdfId: string | null;
  documentSet?: { name: string };
  documentSetVersion?: { versionNumber: number };
  documents: Array<{
    id: string;
    documentName: string;
    status: string;
    template?: { name: string };
    templateVersion?: { versionNumber: number };
  }>;
};

const STEPS = ["Set", "Customer", "Data", "Review", "Preview", "Download"] as const;

function isFieldRequired(field: DocGenFormField): boolean {
  return field.isRequired ?? field.isRequiredDefault;
}

function validateFormClient(
  fields: DocGenFormField[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.fieldKey] ?? "").trim();
    if (isFieldRequired(field) && !value) {
      errors[field.fieldKey] = `${field.label} is required.`;
      continue;
    }
    if (!value) continue;
    if (field.inputType === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(value)) {
      errors[field.fieldKey] = `${field.label} must be a number.`;
    }
    if (field.inputType === "DATE" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors[field.fieldKey] = `${field.label} must be a valid date.`;
    }
  }
  return errors;
}

export function DocGenGenerateWizard({ publishedSets }: { publishedSets: PublishedSet[] }) {
  const [step, setStep] = useState(0);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [formSchema, setFormSchema] = useState<{
    set: { name: string; versionNumber: number };
    documents: Array<{ displayName: string }>;
    fields: DocGenFormField[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [registerNumber, setRegisterNumber] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [linkedServiceId, setLinkedServiceId] = useState<string | null>(null);
  const [customerSource, setCustomerSource] = useState<{
    type: "profile" | "service" | "customer" | "manual";
    id?: string;
  }>({ type: "manual" });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | "combined">("combined");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedSet = useMemo(
    () => publishedSets.find((row) => row.id === selectedSetId),
    [publishedSets, selectedSetId],
  );

  const availableFieldKeys = useMemo(
    () => formSchema?.fields.map((field) => field.fieldKey) ?? [],
    [formSchema],
  );

  const loadFormSchema = useCallback(async (setId: string) => {
    const response = await fetch(`/api/document-generator/sets/${setId}?formSchema=1`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? "Unable to load form.");
    setFormSchema(body);
    const defaults: Record<string, string> = {};
    for (const field of body.fields as DocGenFormField[]) {
      if (field.defaultValue) defaults[field.fieldKey] = field.defaultValue;
    }
    setFieldValues((prev) => ({ ...defaults, ...prev }));
  }, []);

  async function goToCustomer() {
    if (!selectedSetId) return;
    setPending(true);
    setError(null);
    try {
      await loadFormSchema(selectedSetId);
      setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to continue.");
    } finally {
      setPending(false);
    }
  }

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/document-generator/customers/search?q=${encodeURIComponent(searchQuery)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Search failed.");
      setSearchResults(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed.");
    } finally {
      setPending(false);
    }
  }

  function applyProfile(row: SearchHit["profiles"][number]) {
    setDisplayName(row.displayName);
    setRegisterNumber("");
    setProfileId(row.id);
    setLinkedCustomerId(null);
    setLinkedServiceId(null);
    setCustomerSource({ type: "profile", id: row.id });
    setFieldValues((prev) => ({ ...prev, ...(row.fieldValuesJson ?? {}) }));
  }

  function applyService(row: SearchHit["services"][number]) {
    setDisplayName(row.customerName);
    setRegisterNumber("");
    setProfileId(null);
    setLinkedServiceId(row.id);
    setLinkedCustomerId(null);
    setCustomerSource({ type: "service", id: row.id });
    setFieldValues((prev) =>
      prefillFieldValuesFromCustomerSource({
        availableFieldKeys,
        existing: prev,
        preferExisting: false,
        source: {
          displayName: row.customerName,
          mobileNumber: row.mobileNumber,
          consumerNumber: row.consumerNumber,
          address: row.installationAddress,
          city: row.cityOrVillage,
        },
      }),
    );
  }

  function applyCustomer(row: SearchHit["customers"][number]) {
    setDisplayName(row.customerName);
    setRegisterNumber(row.customerCode ?? "");
    setProfileId(null);
    setLinkedCustomerId(row.id);
    setLinkedServiceId(null);
    setCustomerSource({ type: "customer", id: row.id });
    setFieldValues((prev) =>
      prefillFieldValuesFromCustomerSource({
        availableFieldKeys,
        existing: prev,
        preferExisting: false,
        source: {
          displayName: row.customerName,
          mobileNumber: row.mobile,
          address: row.address,
          city: row.city,
        },
      }),
    );
  }

  function goToReview() {
    if (!formSchema) return;
    const errors = validateFormClient(formSchema.fields, fieldValues);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError("Fix required fields before continuing.");
      return;
    }
    setError(null);
    setStep(3);
  }

  async function generateDocuments() {
    if (!selectedSetId || !formSchema) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/document-generator/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentSetId: selectedSetId,
          fieldValues,
          customer: {
            displayName,
            registerNumber: registerNumber || null,
            source: customerSource,
          },
          saveToProfile,
          profileId,
          linkedCustomerId,
          linkedServiceId,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.issues && Array.isArray(body.issues)) {
          const map: Record<string, string> = {};
          for (const issue of body.issues as Array<{ fieldKey: string; message: string }>) {
            map[issue.fieldKey] = issue.message;
          }
          setFieldErrors(map);
          setStep(2);
        }
        throw new Error(body.message ?? "Generation failed.");
      }
      setGeneration(body);
      const firstOk = (body.documents as GenerationResult["documents"]).find(
        (doc) => doc.status === "COMPLETED",
      );
      setPreviewDocId(body.combinedStoredPdfId ? "combined" : (firstOk?.id ?? "combined"));
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setPending(false);
    }
  }

  const previewUrl = useMemo(() => {
    if (!generation) return null;
    if (previewDocId === "combined") {
      return `/api/document-generator/generations/${generation.id}/pdf`;
    }
    return `/api/document-generator/generations/${generation.id}/pdf?documentId=${previewDocId}`;
  }, [generation, previewDocId]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Generate documents</h1>
          <p className="text-sm text-slate-600">Enter customer data once and download MSEB PDFs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/documentation/document-generator">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/documentation/document-generator/history">History</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={index === step ? "text-emerald-700" : index < step ? "text-slate-700" : ""}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      {step === 0 ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <Label htmlFor="setSelect">Document set</Label>
          <select
            id="setSelect"
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={selectedSetId}
            onChange={(e) => setSelectedSetId(e.target.value)}
          >
            <option value="">Select a published set…</option>
            {publishedSets.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          {selectedSet?.description ? (
            <p className="text-sm text-slate-600">{selectedSet.description}</p>
          ) : null}
          {!publishedSets.length ? (
            <p className="text-sm text-amber-800">
              No published document sets yet. A Super Admin must publish a set before generation is
              available.
            </p>
          ) : null}
          <Button onClick={goToCustomer} disabled={!selectedSetId || pending}>
            Continue
          </Button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md flex-1"
              placeholder="Search by name, register number, or service request"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={runSearch} disabled={pending}>
              Search
            </Button>
          </div>
          {searchResults ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <h3 className="text-xs font-semibold uppercase text-slate-500">Profiles</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {searchResults.profiles.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="text-left text-emerald-700 hover:underline"
                        onClick={() => applyProfile(row)}
                      >
                        {row.displayName}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-slate-500">Service requests</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {searchResults.services.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="text-left text-emerald-700 hover:underline"
                        onClick={() => applyService(row)}
                      >
                        {row.customerName} ({row.serviceRequestNumber})
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-slate-500">Sales customers</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {searchResults.customers.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="text-left text-emerald-700 hover:underline"
                        onClick={() => applyCustomer(row)}
                      >
                        {row.customerName}
                        {row.customerCode ? (
                          <span className="block text-xs text-slate-500">{row.customerCode}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="displayName">Customer / applicant name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setCustomerSource({ type: "manual" });
                }}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="registerNumber">Register number</Label>
              <Input
                id="registerNumber"
                value={registerNumber}
                onChange={(e) => {
                  setRegisterNumber(e.target.value);
                  setCustomerSource({ type: "manual" });
                }}
                placeholder="Customer register / code"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Mobile, consumer number, and other details are entered in the next Data fields step.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={() => setStep(2)} disabled={!displayName.trim()}>
              Continue to data entry
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 && formSchema ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            {formSchema.fields.length} shared field(s) for {formSchema.set.name} (v
            {formSchema.set.versionNumber}).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {formSchema.fields.map((field) => (
              <div key={field.fieldId} className={field.inputType === "TEXTAREA" ? "sm:col-span-2" : ""}>
                <DocGenFieldInput
                  field={field}
                  value={fieldValues[field.fieldKey] ?? ""}
                  error={fieldErrors[field.fieldKey]}
                  onChange={(value) =>
                    setFieldValues((prev) => ({
                      ...prev,
                      [field.fieldKey]: value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={goToReview}>Review</Button>
          </div>
        </section>
      ) : null}

      {step === 3 && formSchema ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Review</h2>
          <p className="text-sm">
            <span className="text-slate-500">Customer:</span> {displayName}
            {registerNumber ? ` · Reg. ${registerNumber}` : ""}
          </p>
          <p className="text-sm">
            <span className="text-slate-500">Set:</span> {formSchema.set.name} —{" "}
            {formSchema.documents.map((doc) => doc.displayName).join(", ")}
          </p>
          <ul className="text-sm text-slate-700">
            {formSchema.fields.map((field) => {
              const raw = fieldValues[field.fieldKey] || "";
              const display =
                field.inputType === "DATE" && raw ? formatDocGenDateDisplay(raw) : raw || "—";
              return (
                <li key={field.fieldId}>
                  <span className="text-slate-500">{field.label}:</span> {display}
                </li>
              );
            })}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveToProfile}
              onChange={(e) => setSaveToProfile(e.target.checked)}
            />
            Save field values to DocGen profile for next time
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={generateDocuments} disabled={pending}>
              {pending ? "Generating…" : "Generate & preview"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 && generation ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Preview — {generation.status}</h2>
          {generation.documentSet && generation.documentSetVersion ? (
            <p className="text-sm text-slate-600">
              Pinned set: {generation.documentSet.name} v{generation.documentSetVersion.versionNumber}
            </p>
          ) : null}
          {generation.errorMessage ? (
            <p className="text-sm text-amber-800">{generation.errorMessage}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {generation.combinedStoredPdfId ? (
              <Button
                type="button"
                size="sm"
                variant={previewDocId === "combined" ? "default" : "outline"}
                onClick={() => setPreviewDocId("combined")}
              >
                Combined
              </Button>
            ) : null}
            {generation.documents
              .filter((doc) => doc.status === "COMPLETED")
              .map((doc) => (
                <Button
                  key={doc.id}
                  type="button"
                  size="sm"
                  variant={previewDocId === doc.id ? "default" : "outline"}
                  onClick={() => setPreviewDocId(doc.id)}
                >
                  {doc.documentName}
                </Button>
              ))}
          </div>
          {previewUrl ? (
            <iframe
              title="Document preview"
              src={previewUrl}
              className="h-[70vh] w-full rounded border border-slate-200 bg-slate-50"
            />
          ) : (
            <p className="text-sm text-slate-600">No PDF available to preview.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>
              Back to review
            </Button>
            <Button onClick={() => setStep(5)}>Continue to download</Button>
          </div>
        </section>
      ) : null}

      {step === 5 && generation ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Download — {generation.status}</h2>
          {generation.errorMessage ? (
            <p className="text-sm text-amber-800">{generation.errorMessage}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {generation.combinedStoredPdfId ? (
              <Button asChild>
                <a
                  href={`/api/document-generator/generations/${generation.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download combined PDF
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Open for print
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {generation.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {doc.documentName} — {doc.status}
                  {doc.template && doc.templateVersion
                    ? ` · ${doc.template.name} v${doc.templateVersion.versionNumber}`
                    : ""}
                </span>
                {doc.status === "COMPLETED" ? (
                  <a
                    className="text-emerald-700 hover:underline"
                    href={`/api/document-generator/generations/${generation.id}/pdf?documentId=${doc.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(4)}>
              Back to preview
            </Button>
            <Button asChild variant="outline">
              <Link href={`/documentation/document-generator/history/${generation.id}`}>
                Open in history
              </Link>
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
