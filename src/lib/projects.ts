import type { Prisma, PrismaClient } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Project Open",
  MATERIAL_DRAFT: "Material Assignment (Draft)",
  MATERIAL_PENDING_APPROVAL: "Pending Material Approval",
  MATERIAL_ASSIGNED: "Material Assigned",
  READY_FOR_DISPATCH: "Ready for Dispatch",
  PARTIALLY_DISPATCHED: "Partially Dispatched",
  FULLY_DISPATCHED: "Fully Dispatched",
  CLOSED: "Project Closed",
};

export const PROJECT_LINE_SOURCE_LABELS: Record<string, string> = {
  PROPOSAL: "From Proposal",
  ADDED: "Added Line",
};

export const PROJECT_LINE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  PENDING_STOCK: "Pending Stock",
  ASSIGNED: "Qty Reserved",
  PARTIALLY_DISPATCHED: "Partial Dispatch",
  FULLY_DISPATCHED: "Fully Dispatched",
};

export function formatProjectStatus(status: string): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function formatProjectLineSource(source: string): string {
  return PROJECT_LINE_SOURCE_LABELS[source] ?? source;
}

export function formatProjectLineStatus(status: string): string {
  return PROJECT_LINE_STATUS_LABELS[status] ?? status;
}

export async function generateProjectNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "PROJECT";

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

  return `${companyCode}-PRJ-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

export const PROJECT_DISPATCH_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  DISPATCHED: "Dispatched",
  CANCEL_PENDING: "Cancel Pending",
  CANCELLED: "Cancelled",
};

export function formatProjectDispatchStatus(status: string): string {
  return PROJECT_DISPATCH_STATUS_LABELS[status] ?? status;
}

export async function generateProjectDispatchNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "PROJECT_DISPATCH";

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

  return `${companyCode}-PDC-${fy}-${String(nextSeq).padStart(5, "0")}`;
}
