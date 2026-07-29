import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";
import { roundMoney } from "@/lib/quotations";

export const BOOKING_ADVANCE_PERCENT = 50;

export type BookingTermsInput = {
  deliveryTermMode?: string | null;
  bookingAllowed?: boolean | null;
  requiredPaymentPercent?: number | null;
};

export type BookingRequirement = {
  allowed: boolean;
  requiredPaymentPercent: number;
  reason?: "BOOKING_NOT_ALLOWED";
};

export function resolveBookingRequirement(
  pi: BookingTermsInput,
  quotation?: BookingTermsInput | null,
): BookingRequirement {
  const mode = pi.deliveryTermMode ?? quotation?.deliveryTermMode ?? null;
  const allowedFlag = pi.bookingAllowed ?? quotation?.bookingAllowed ?? null;

  if (
    allowedFlag === false ||
    mode === "SUBJECT_TO_AVAILABILITY" ||
    (mode === "LEGACY" && allowedFlag !== true)
  ) {
    return {
      allowed: false,
      requiredPaymentPercent: BOOKING_ADVANCE_PERCENT,
      reason: "BOOKING_NOT_ALLOWED",
    };
  }

  const requiredPaymentPercent =
    mode === "READY_STOCK"
      ? 100
      : (pi.requiredPaymentPercent ??
        quotation?.requiredPaymentPercent ??
        BOOKING_ADVANCE_PERCENT);

  return { allowed: true, requiredPaymentPercent };
}

export function calculateAdvanceRequired(
  totalValue: number,
  requiredPaymentPercent = BOOKING_ADVANCE_PERCENT,
): number {
  return roundMoney(totalValue * (requiredPaymentPercent / 100));
}

export function calculateOutstanding(totalValue: number, totalPaid: number): number {
  return roundMoney(Math.max(0, totalValue - totalPaid));
}

export function canRequestBooking(
  totalValue: number,
  totalPaid: number,
  requirement: BookingRequirement = {
    allowed: true,
    requiredPaymentPercent: BOOKING_ADVANCE_PERCENT,
  },
): boolean {
  return (
    requirement.allowed &&
    totalPaid >= calculateAdvanceRequired(totalValue, requirement.requiredPaymentPercent)
  );
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
