import type { Prisma, PrismaClient } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";
import { addDays, toDateOnly } from "@/lib/quotations";
import { PROJECT_PROPOSAL_VALIDITY_DAYS } from "@/lib/project-proposal-pricing";

export function formatRevisionProposalLabel(revisionNo: number): string {
  return `Rev${revisionNo}`;
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
