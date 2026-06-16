import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";
import { roundMoney } from "@/lib/quotations";

export const BOOKING_ADVANCE_PERCENT = 50;

export function calculateAdvanceRequired(totalValue: number): number {
  return roundMoney(totalValue * (BOOKING_ADVANCE_PERCENT / 100));
}

export function calculateOutstanding(totalValue: number, totalPaid: number): number {
  return roundMoney(Math.max(0, totalValue - totalPaid));
}

export function canRequestBooking(totalValue: number, totalPaid: number): boolean {
  return totalPaid >= calculateAdvanceRequired(totalValue);
}

export async function generateProformaInvoiceNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "PROFORMA_INVOICE";

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

  return `${companyCode}-PI-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

export function formatProformaStatus(status: string): string {
  if (status === "FULLY_DISPATCHED") return "Fully Dispatched";
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatPaymentMode(mode: string): string {
  return mode
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}
