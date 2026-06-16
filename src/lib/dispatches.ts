import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";

export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export async function generateDispatchNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "DISPATCH";

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

  return `${companyCode}-DC-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

export function formatDispatchStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function getRemainingQty(orderedQty: number, dispatchedQty: number): number {
  return Math.max(0, orderedQty - dispatchedQty);
}
