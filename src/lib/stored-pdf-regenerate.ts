import { PdfDocumentType, type PrismaClient } from "@prisma/client";
import { canManageDispatches } from "@/lib/dispatch-permissions";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { canManageProformaInvoices } from "@/lib/pi-permissions";
import { invalidateStoredPdf } from "@/lib/pdf-cache";
import { canManageProjectDispatches } from "@/lib/project-permissions";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
import { canManageQuotations } from "@/lib/quotation-permissions";

export class StoredPdfRegenerateError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

async function assertDocumentAccess(
  prisma: PrismaClient,
  input: {
    companyId: string;
    documentType: PdfDocumentType;
    documentId: string;
    userRoles: string[];
  },
): Promise<void> {
  const { companyId, documentType, documentId, userRoles } = input;

  switch (documentType) {
    case "QUOTATION": {
      if (!canManageQuotations(userRoles)) {
        throw new StoredPdfRegenerateError("FORBIDDEN", "You do not have permission for this action.");
      }
      const row = await prisma.quotation.findFirst({
        where: { id: documentId, companyId },
        select: { id: true },
      });
      if (!row) throw new StoredPdfRegenerateError("NOT_FOUND", "Quotation not found.");
      return;
    }
    case "PROFORMA_INVOICE": {
      if (!canManageProformaInvoices(userRoles)) {
        throw new StoredPdfRegenerateError("FORBIDDEN", "You do not have permission for this action.");
      }
      const row = await prisma.proformaInvoice.findFirst({
        where: { id: documentId, companyId },
        select: { id: true },
      });
      if (!row) throw new StoredPdfRegenerateError("NOT_FOUND", "Proforma invoice not found.");
      return;
    }
    case "DISPATCH": {
      if (!canManageDispatches(userRoles)) {
        throw new StoredPdfRegenerateError("FORBIDDEN", "You do not have permission for this action.");
      }
      const row = await prisma.dispatch.findFirst({
        where: { id: documentId, companyId },
        select: { id: true },
      });
      if (!row) throw new StoredPdfRegenerateError("NOT_FOUND", "Dispatch not found.");
      return;
    }
    case "PROJECT_DISPATCH": {
      if (!canManageProjectDispatches(userRoles)) {
        throw new StoredPdfRegenerateError("FORBIDDEN", "You do not have permission for this action.");
      }
      const row = await prisma.projectDispatch.findFirst({
        where: { id: documentId, companyId },
        select: { id: true },
      });
      if (!row) throw new StoredPdfRegenerateError("NOT_FOUND", "Project dispatch not found.");
      return;
    }
    case "PROJECT_PROPOSAL": {
      if (!canManageProjectProposals(userRoles)) {
        throw new StoredPdfRegenerateError("FORBIDDEN", "You do not have permission for this action.");
      }
      const row = await prisma.projectProposal.findFirst({
        where: { id: documentId, companyId },
        select: { id: true },
      });
      if (!row) throw new StoredPdfRegenerateError("NOT_FOUND", "Project proposal not found.");
      return;
    }
    case "OFFICIAL_LETTER_PRINT": {
      if (!canManageOfficialLetters(userRoles)) {
        throw new StoredPdfRegenerateError("FORBIDDEN", "You do not have permission for this action.");
      }
      const row = await prisma.officialLetter.findFirst({
        where: {
          id: documentId,
          companyId,
          company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
        },
        select: { id: true },
      });
      if (!row) throw new StoredPdfRegenerateError("NOT_FOUND", "Letter not found.");
      return;
    }
    case "DOC_GEN_TEMPLATE_BACKGROUND":
    case "DOC_GEN_TEMPLATE_WORD":
    case "DOC_GEN_OUTPUT":
    case "DOC_GEN_COMBINED":
      throw new StoredPdfRegenerateError(
        "NOT_FOUND",
        "Document generator PDFs cannot be regenerated from this tool.",
      );
    default: {
      const _exhaustive: never = documentType;
      throw new StoredPdfRegenerateError("NOT_FOUND", `Unsupported document type: ${_exhaustive}`);
    }
  }
}

export async function regenerateStoredPdf(
  prisma: PrismaClient,
  input: {
    companyId: string;
    documentType: PdfDocumentType;
    documentId: string;
    variant?: string;
    userRoles: string[];
  },
): Promise<{ deleted: boolean }> {
  await assertDocumentAccess(prisma, input);
  const deleted = await invalidateStoredPdf(prisma, {
    documentType: input.documentType,
    documentId: input.documentId,
    variant: input.variant,
  });
  return { deleted };
}
