"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatApiErrorMessage, parseApiJson } from "@/lib/api-response";
import { getBusinessToday } from "@/lib/business-dates";
import { defaultSignatoryForCode, letterHtmlHasText, sanitizeLetterHtml } from "@/lib/letter-content";
import { formatLetterDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/dispatches/signature-pad";
import { LetterPreview } from "@/components/letters/letter-preview";
import { LetterRichTextEditor } from "@/components/letters/letter-editor";
import { LettersNav } from "@/components/letters/letters-nav";

export type LetterCompanyOption = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  tagline?: string | null;
  defaultSignatoryName?: string | null;
  defaultSignatoryDesignation?: string | null;
  printContentTopOffsetMm: number;
  signatureImageData?: string | null;
  stampImageData?: string | null;
};

export type LetterDraftRecord = {
  id: string;
  status: "DRAFT" | "ISSUED";
  letterSerialNumber: string | null;
  letterDate: string;
  content: string;
  signatoryName: string;
  signatoryDesignation: string;
  stampEnabled: boolean;
  printSignatureEnabled: boolean;
  signatureImageData?: string | null;
  company: { id: string };
};

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

export function LetterCreateForm({
  companies,
  draft,
}: {
  companies: LetterCompanyOption[];
  draft?: LetterDraftRecord | null;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(draft?.company.id ?? companies[0]?.id ?? "");
  const company = useMemo(
    () => companies.find((item) => item.id === companyId) ?? null,
    [companies, companyId],
  );
  const fallback = defaultSignatoryForCode(company?.code ?? "ISE");

  const [letterId, setLetterId] = useState(draft?.id ?? null);
  const [status, setStatus] = useState<"new" | "DRAFT" | "ISSUED">(
    draft?.status === "ISSUED" ? "ISSUED" : draft ? "DRAFT" : "new",
  );
  const issued = status === "ISSUED";
  const [letterDate, setLetterDate] = useState(draft?.letterDate ?? getBusinessToday());
  const [content, setContent] = useState(draft?.content ?? "<p></p>");
  const [signatoryName, setSignatoryName] = useState(
    draft?.signatoryName || companies[0]?.defaultSignatoryName || fallback.name,
  );
  const [signatoryDesignation, setSignatoryDesignation] = useState(
    draft?.signatoryDesignation || companies[0]?.defaultSignatoryDesignation || fallback.designation,
  );
  const [useCompanySignature, setUseCompanySignature] = useState(!draft?.signatureImageData);
  const [signatureOverride, setSignatureOverride] = useState<string | null>(
    draft?.signatureImageData ?? null,
  );
  const [stampEnabled, setStampEnabled] = useState(draft?.stampEnabled ?? true);
  const [printSignatureEnabled, setPrintSignatureEnabled] = useState(
    draft?.printSignatureEnabled ?? true,
  );
  const [printPreview, setPrintPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdSerial, setCreatedSerial] = useState<string | null>(draft?.letterSerialNumber ?? null);
  const [draftMessage, setDraftMessage] = useState("");

  const signatureImageData = useCompanySignature
    ? company?.signatureImageData ?? null
    : signatureOverride;

  function applyCompany(nextId: string) {
    if (issued) return;
    const next = companies.find((item) => item.id === nextId);
    setCompanyId(nextId);
    const defaults = defaultSignatoryForCode(next?.code ?? "ISE");
    setSignatoryName(next?.defaultSignatoryName || defaults.name);
    setSignatoryDesignation(next?.defaultSignatoryDesignation || defaults.designation);
    setUseCompanySignature(true);
    setSignatureOverride(null);
  }

  function payload(asDraft?: boolean) {
    return {
      companyId,
      letterDate,
      content: sanitizeLetterHtml(content),
      signatoryName,
      signatoryDesignation,
      signatureImageData: useCompanySignature ? null : signatureOverride,
      useCompanySignature,
      stampEnabled,
      printSignatureEnabled,
      asDraft,
    };
  }

  async function saveDraft() {
    if (!companyId) throw new Error("Select a company.");
    const url = letterId && status === "DRAFT" ? `/api/letters/${letterId}` : "/api/letters";
    const method = letterId && status === "DRAFT" ? "PATCH" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(true)),
    });
    const result = await parseApiJson<{
      id?: string;
      status?: "DRAFT" | "ISSUED";
      message?: string;
      details?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
    }>(response);
    if (!response.ok || !result.id) {
      throw new Error(formatApiErrorMessage(result, "Could not save the draft."));
    }
    setLetterId(result.id);
    setStatus("DRAFT");
    setDraftMessage("Draft saved. Generate PDF when the letter is ready.");
    router.replace(`/documents/letterhead?id=${result.id}`);
    return result.id;
  }

  async function issueLetter() {
    if (!companyId) throw new Error("Select a company.");
    if (!letterHtmlHasText(content)) throw new Error("Enter letter content.");

    if (letterId && status === "DRAFT") {
      const response = await fetch(`/api/letters/${letterId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const result = await parseApiJson<{
        id?: string;
        letterSerialNumber?: string | null;
        message?: string;
        details?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
      }>(response);
      if (!response.ok || !result.id) {
        throw new Error(formatApiErrorMessage(result, "Could not generate the letter."));
      }
      setLetterId(result.id);
      setStatus("ISSUED");
      setCreatedSerial(result.letterSerialNumber ?? null);
      return result.id;
    }

    const response = await fetch("/api/letters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(false)),
    });
    const result = await parseApiJson<{
      id?: string;
      letterSerialNumber?: string | null;
      message?: string;
      details?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
    }>(response);
    if (!response.ok || !result.id) {
      throw new Error(formatApiErrorMessage(result, "Could not generate the letter."));
    }
    setLetterId(result.id);
    setStatus("ISSUED");
    setCreatedSerial(result.letterSerialNumber ?? null);
    return result.id;
  }

  async function handleSaveDraft() {
    setError("");
    setDraftMessage("");
    setSubmitting(true);
    try {
      await saveDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the draft.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerate() {
    setError("");
    setDraftMessage("");
    setSubmitting(true);
    try {
      const id = issued && letterId ? letterId : await issueLetter();
      window.open(`/api/letters/${id}/pdf`, "_blank", "noopener,noreferrer");
      router.push(`/documents/letters/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the letter.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePrint() {
    setError("");
    setDraftMessage("");
    setSubmitting(true);
    try {
      const id = issued && letterId ? letterId : await saveDraft();
      window.open(`/api/letters/${id}/print`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not print the letter.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <LettersNav />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Letterhead Generator</h1>
        <p className="text-sm text-slate-500">
          Save a draft at any time. Generate PDF stores one immutable snapshot and assigns the internal serial.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card>
          <CardHeader>
            <CardTitle>{issued ? "Issued letter" : status === "DRAFT" ? "Draft letter" : "Letter"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="letter-company">Company</Label>
                <select
                  id="letter-company"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={companyId}
                  disabled={issued || Boolean(letterId)}
                  onChange={(event) => applyCompany(event.target.value)}
                >
                  {companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="letter-date">Letter date</Label>
                <Input
                  id="letter-date"
                  type="date"
                  value={letterDate}
                  disabled={issued}
                  onChange={(event) => setLetterDate(event.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Displays as {letterDate ? formatLetterDate(letterDate) : "D Month YYYY"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Letter content</Label>
              <LetterRichTextEditor key={letterId ?? "new"} value={content} onChange={setContent} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="signatory-name">Signed by</Label>
                <Input
                  id="signatory-name"
                  value={signatoryName}
                  disabled={issued}
                  onChange={(event) => setSignatoryName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signatory-designation">Designation</Label>
                <Input
                  id="signatory-designation"
                  value={signatoryDesignation}
                  disabled={issued}
                  onChange={(event) => setSignatoryDesignation(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 p-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useCompanySignature}
                  disabled={issued}
                  onChange={(event) => {
                    setUseCompanySignature(event.target.checked);
                    if (event.target.checked) setSignatureOverride(null);
                  }}
                />
                Use company default signature
              </label>
              {!useCompanySignature ? (
                <div className="space-y-3">
                  {signatureOverride ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signatureOverride} alt="" className="h-16 object-contain" />
                  ) : null}
                  <SignaturePad
                    label="Draw signature"
                    hint="Draw a signature or upload an image for this letter only."
                    onChange={setSignatureOverride}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="signature-upload">Or upload signature image</Label>
                    <Input
                      id="signature-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={issued}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          setSignatureOverride(await readImageFile(file));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Could not read image.");
                        }
                      }}
                    />
                  </div>
                </div>
              ) : company?.signatureImageData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.signatureImageData} alt="" className="h-16 object-contain" />
              ) : (
                <p className="text-xs text-slate-500">
                  No company signature uploaded yet. Add one under Companies, or uncheck to draw/upload for this letter.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={stampEnabled}
                disabled={issued}
                onChange={(event) => setStampEnabled(event.target.checked)}
              />
              Include company stamp on the official PDF
            </label>
            {stampEnabled && company?.stampImageData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.stampImageData} alt={`${company.code} stamp`} className="h-20 object-contain" />
            ) : null}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={printSignatureEnabled}
                disabled={issued}
                onChange={(event) => setPrintSignatureEnabled(event.target.checked)}
              />
              Print signature on physical letterhead
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {draftMessage ? <p className="text-sm text-emerald-700">{draftMessage}</p> : null}
            {createdSerial ? (
              <p className="text-sm text-emerald-700">
                Stored as internal serial {createdSerial}. The official PDF will not change.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setPrintPreview(false)}>
                Preview
              </Button>
              <Button type="button" variant="outline" onClick={() => setPrintPreview(true)}>
                Print preview
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={submitting || issued || companies.length === 0}
              >
                Save as draft
              </Button>
              <Button type="button" onClick={handleGenerate} disabled={submitting || companies.length === 0}>
                {issued ? "Download PDF" : "Generate PDF"}
              </Button>
              <Button type="button" variant="secondary" onClick={handlePrint} disabled={submitting}>
                Print
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {printPreview ? "Physical letterhead print preview" : "Official letter preview"}
          </h2>
          <LetterPreview
            company={company}
            letterDate={letterDate}
            content={content}
            signatoryName={signatoryName}
            signatoryDesignation={signatoryDesignation}
            signatureImageData={signatureImageData}
            stampImageData={company?.stampImageData}
            stampEnabled={stampEnabled}
            printMode={printPreview}
            printSignatureEnabled={printSignatureEnabled}
          />
          {printPreview ? (
            <p className="text-xs text-slate-500">
              Print output omits logo, header, footer and stamp, and reserves{" "}
              {company?.printContentTopOffsetMm ?? 65} mm at the top for physical letterhead.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
