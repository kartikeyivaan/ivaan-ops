import { formatLetterDate } from "@/lib/utils";
import { sanitizeLetterHtml } from "@/lib/letter-content";

export type LetterPreviewCompany = {
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
};

export function LetterPreview({
  company,
  letterDate,
  content,
  signatoryName,
  signatoryDesignation,
  signatureImageData,
  stampImageData,
  stampEnabled,
  printMode,
  printSignatureEnabled,
}: {
  company: LetterPreviewCompany | null;
  letterDate: string;
  content: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatureImageData?: string | null;
  stampImageData?: string | null;
  stampEnabled: boolean;
  printMode?: boolean;
  printSignatureEnabled: boolean;
}) {
  const dateLabel = letterDate ? formatLetterDate(letterDate) : "";
  const locality = [company?.city, [company?.state, company?.pincode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const showSignature = printMode ? printSignatureEnabled : true;
  const showStamp = !printMode && stampEnabled && Boolean(stampImageData);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-800 shadow-inner">
      {!printMode && company ? (
        <div className="mb-6 border-b border-slate-200 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-slate-900">{company.name}</p>
              {company.tagline ? <p className="text-xs font-medium text-amber-700">{company.tagline}</p> : null}
              {company.address
                ? company.address.split("\n").map((line) => (
                    <p key={line} className="text-xs text-slate-500">
                      {line}
                    </p>
                  ))
                : null}
              {locality ? <p className="text-xs text-slate-500">{locality}</p> : null}
              <p className="text-xs text-slate-500">
                {[company.phone, company.email].filter(Boolean).join("  |  ")}
              </p>
              {company.gstNumber ? (
                <p className="text-xs font-medium text-slate-700">GSTIN: {company.gstNumber}</p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm text-slate-800">{dateLabel}</p>
          </div>
        </div>
      ) : (
        <div className="mb-8 flex justify-end">
          <p className="text-sm text-slate-800">{dateLabel}</p>
        </div>
      )}

      <div
        className="min-h-[160px] leading-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(content || "<p></p>") }}
      />

      <div className="relative mt-10 flex justify-end">
        <div className="w-56">
          {company ? <p className="text-xs text-slate-500">For {company.name}</p> : null}
          {showSignature && signatureImageData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureImageData} alt="" className="my-2 h-14 object-contain" />
          ) : (
            <div className="h-10" />
          )}
          <p className="font-semibold text-slate-900">{signatoryName}</p>
          <p className="text-xs text-slate-500">{signatoryDesignation}</p>
        </div>
        {showStamp ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stampImageData ?? ""}
            alt=""
            className="absolute bottom-0 right-0 h-20 w-20 object-contain opacity-90"
          />
        ) : null}
      </div>
    </div>
  );
}
