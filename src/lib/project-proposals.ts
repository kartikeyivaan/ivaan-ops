import type { Prisma, PrismaClient } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";
import { addDays, toDateOnly } from "@/lib/quotations";
import { PROJECT_PROPOSAL_VALIDITY_DAYS } from "@/lib/project-proposal-pricing";

export function formatRevisionProposalLabel(revisionNo: number): string {
  return `R${revisionNo}`;
}

export function formatProposalDocumentNumber(proposalNo: string, revisionNo: number): string {
  if (revisionNo <= 0) return proposalNo;
  return `${proposalNo}-R${revisionNo}`;
}

export function formatProjectProposalStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatApprovalStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const SHAREABLE_STATUSES = new Set(["APPROVED", "SENT", "CONVERTED"]);

export function canShareProjectProposal(status: string): boolean {
  return SHAREABLE_STATUSES.has(status);
}

export function getProposalValidityDate(proposalDate: Date): Date {
  return toDateOnly(addDays(proposalDate, PROJECT_PROPOSAL_VALIDITY_DAYS));
}

/** Bump when proposal PDF layout/content generation changes (cache busting). */
export const PROJECT_PROPOSAL_PDF_LAYOUT_VERSION = 2;

export const PROJECT_PROPOSAL_PDF_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
} as const;

export function projectProposalPdfUrl(
  proposalId: string,
  options?: { format?: "card" | "full"; revisionNo?: number },
): string {
  const format = options?.format ?? "full";
  const revisionNo = options?.revisionNo ?? 1;
  const params = new URLSearchParams({
    format,
    rev: String(revisionNo),
    v: String(PROJECT_PROPOSAL_PDF_LAYOUT_VERSION),
  });
  return `/api/project-proposals/${proposalId}/pdf?${params.toString()}`;
}

export async function generateProposalNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "PROJECT_PROPOSAL";

  const existing = await prisma.documentSequence.findUnique({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
  });

  const nextSeq = (existing?.lastSequence ?? 0) + 1;

  await prisma.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
    create: {
      companyId,
      documentType: docType,
      financialYear: fy,
      lastSequence: nextSeq,
    },
    update: { lastSequence: nextSeq },
  });

  return `${companyCode}-PP-${fy}-${String(nextSeq).padStart(5, "0")}`;
}
