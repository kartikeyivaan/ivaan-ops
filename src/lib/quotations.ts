import { PricingType, type PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";

export const QUOTATION_VALIDITY_DAYS = 3;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function isProductPriceEffectiveOn(
  price: { effectiveFrom: Date; effectiveTo: Date | null },
  asOf: Date,
): boolean {
  const asOfDay = toDateOnly(asOf);
  const nextDay = addDays(asOfDay, 1);
  return (
    price.effectiveFrom < nextDay &&
    (price.effectiveTo === null || price.effectiveTo >= asOfDay)
  );
}

export function calculateLineAmounts(input: {
  pricingType: PricingType;
  capacity: number;
  qty: number;
  rate: number;
  gstRate: number;
}) {
  const subtotal =
    input.pricingType === PricingType.WP
      ? input.qty * input.capacity * input.rate
      : input.qty * input.rate;
  const gstAmount = subtotal * (input.gstRate / 100);
  const lineTotal = subtotal + gstAmount;

  return {
    subtotal: roundMoney(subtotal),
    gstAmount: roundMoney(gstAmount),
    lineTotal: roundMoney(lineTotal),
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatRevisionQuotationNo(baseNo: string, revisionNo: number): string {
  if (revisionNo <= 1) return baseNo;
  return `${baseNo}-R${revisionNo}`;
}

export async function generateQuotationNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "QUOTATION";

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

  return `${companyCode}-QT-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

export function formatQuotationStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}
