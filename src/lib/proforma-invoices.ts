import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";
import { roundMoney } from "@/lib/quotations";

export const BOOKING_ADVANCE_PERCENT = 50;

/** Residual outstanding below this amount (INR) still qualifies for booking and dispatch. */
export const PAYMENT_OUTSTANDING_TOLERANCE_INR = 10;

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

/** True when remaining balance is under the ₹10 fulfillment tolerance. */
export function isOutstandingWithinTolerance(outstanding: number): boolean {
  return outstanding < PAYMENT_OUTSTANDING_TOLERANCE_INR;
}

export function canRequestBooking(
  totalValue: number,
  totalPaid: number,
  requirement: BookingRequirement = {
    allowed: true,
    requiredPaymentPercent: BOOKING_ADVANCE_PERCENT,
  },
): boolean {
  if (!requirement.allowed) return false;
  if (isOutstandingWithinTolerance(calculateOutstanding(totalValue, totalPaid))) {
    return true;
  }
  return (
    totalPaid >= calculateAdvanceRequired(totalValue, requirement.requiredPaymentPercent)
  );
}

/** Statuses where remaining (or initial) payments may still be recorded. */
export const PAYMENT_RECORDABLE_STATUSES = [
  "ISSUED",
  "PENDING_BOOKING",
  "BOOKED",
  "PARTIALLY_DISPATCHED",
  "FULLY_DISPATCHED",
] as const;

export function canRecordPaymentAgainstPi(status: string, outstanding: number): boolean {
  return (
    (PAYMENT_RECORDABLE_STATUSES as readonly string[]).includes(status) && outstanding > 0
  );
}

/** Existing payments may be edited/deleted except on draft or cancelled PIs. */
export function canManageExistingPiPayment(status: string): boolean {
  return status !== "DRAFT" && status !== "CANCEL_PENDING" && status !== "CANCELLED";
}

/**
 * Header/line edits keep the same PI number and customer. Allowed on drafts
 * and issued PIs (including paid / on-credit). Booked PIs must be unbooked first.
 * Payment sufficiency is enforced at booking of the updated PI, not at edit time.
 */
export function canEditProformaInvoice(input: {
  status: string;
  paymentCount?: number;
  totalPaid?: number;
  creditStatus?: string | null;
  hasPendingEdit?: boolean;
}): boolean {
  if (input.hasPendingEdit) return false;
  return input.status === "DRAFT" || input.status === "ISSUED";
}

/** Booked stock must be released before lines can change. */
export function canUnbookProformaInvoice(input: { status: string }): boolean {
  return input.status === "PENDING_BOOKING" || input.status === "BOOKED";
}

/** Max amount allowed when editing a payment (current outstanding + this payment). */
export function maxPaymentAmountOnEdit(
  totalValue: number,
  totalPaid: number,
  existingPaymentAmount: number,
): number {
  return roundMoney(calculateOutstanding(totalValue, totalPaid) + existingPaymentAmount);
}

/**
 * Booked (or partially dispatched) PIs become dispatch-ready once outstanding
 * is under the ₹10 tolerance (including fully paid), or when trade credit is approved.
 */
export function isReadyForDispatch(
  status: string,
  outstanding: number,
  options?: { hasApprovedCredit?: boolean },
): boolean {
  if (status !== "BOOKED" && status !== "PARTIALLY_DISPATCHED") return false;
  if (isOutstandingWithinTolerance(outstanding)) return true;
  return Boolean(options?.hasApprovedCredit);
}

/** Calendar-day difference between two YYYY-MM-DD (or Date) values: committed − today. */
export function daysUntilCommittedDispatch(
  committedDate: string | Date | null | undefined,
  today: string | Date = new Date(),
): number | null {
  if (!committedDate) return null;
  const committed =
    typeof committedDate === "string"
      ? committedDate.slice(0, 10)
      : committedDate.toISOString().slice(0, 10);
  const todayString =
    typeof today === "string" ? today.slice(0, 10) : today.toISOString().slice(0, 10);
  const committedMs = Date.parse(`${committed}T00:00:00.000Z`);
  const todayMs = Date.parse(`${todayString}T00:00:00.000Z`);
  if (Number.isNaN(committedMs) || Number.isNaN(todayMs)) return null;
  return Math.round((committedMs - todayMs) / 86_400_000);
}

export function isDispatchTodayActive(
  dispatchTodayDate: string | Date | null | undefined,
  today: string | Date = new Date(),
): boolean {
  if (!dispatchTodayDate) return false;
  const marked =
    typeof dispatchTodayDate === "string"
      ? dispatchTodayDate.slice(0, 10)
      : dispatchTodayDate.toISOString().slice(0, 10);
  const todayString =
    typeof today === "string" ? today.slice(0, 10) : today.toISOString().slice(0, 10);
  return marked === todayString;
}

/** Early vs committed min date — needs sales manager / admin approval. */
export function needsEarlyDispatchTodayApproval(
  committedMinDate: string | Date | null | undefined,
  today: string | Date = new Date(),
): boolean {
  const days = daysUntilCommittedDispatch(committedMinDate, today);
  return days != null && days > 0;
}

export type DispatchTodayApprovalReasons = {
  daysUntil: number | null;
  needsEarly: boolean;
  fromCompanyCode: string | null;
};

/** Single copy for approval remarks, notifications, and confirm prompts. */
export function buildDispatchTodayApprovalCopy(
  reasons: DispatchTodayApprovalReasons,
): { remarks: string; title: string; summaryParts: string[] } {
  const summaryParts: string[] = [];
  if (reasons.needsEarly && reasons.daysUntil != null) {
    summaryParts.push(
      `Early dispatch approval (${reasons.daysUntil} day(s) before committed delivery)`,
    );
  }
  if (reasons.fromCompanyCode) {
    summaryParts.push(`Stock transfer approval from ${reasons.fromCompanyCode}`);
  }

  const remarks =
    summaryParts.length > 0
      ? summaryParts.join("; ")
      : "Dispatch today approval requested";

  let title = "Dispatch today approval needed";
  if (reasons.needsEarly && reasons.fromCompanyCode) {
    title = "Early dispatch & stock transfer approval needed";
  } else if (reasons.needsEarly) {
    title = "Early dispatch approval needed";
  } else if (reasons.fromCompanyCode) {
    title = "Stock transfer approval needed";
  }

  return { remarks, title, summaryParts };
}

export function formatDispatchTodayApprovalMessage(
  piNo: string,
  reasons: DispatchTodayApprovalReasons,
): string {
  const { summaryParts } = buildDispatchTodayApprovalCopy(reasons);
  if (summaryParts.length === 0) {
    return `${piNo} requested dispatch today and needs approval.`;
  }
  if (summaryParts.length === 1) {
    return `${piNo}: ${summaryParts[0]}.`;
  }
  return `${piNo} requires approval for early dispatch and stock transfer — ${summaryParts.join("; ")}.`;
}

export function formatDispatchTodayConfirmationMessage(
  reasons: DispatchTodayApprovalReasons & { committedDate?: string | null },
): string {
  const parts: string[] = [];
  if (reasons.needsEarly && reasons.daysUntil != null) {
    parts.push(
      `committed delivery is after ${reasons.daysUntil} day(s)` +
        (reasons.committedDate ? ` (${reasons.committedDate})` : ""),
    );
  }
  if (reasons.fromCompanyCode) {
    parts.push(`stock will be transferred from ${reasons.fromCompanyCode}`);
  }
  if (parts.length === 0) {
    return "Confirm dispatch today to continue.";
  }
  if (parts.length === 1) {
    return `${parts[0][0]!.toUpperCase()}${parts[0]!.slice(1)}. Confirm to request approval.`;
  }
  return `${parts[0][0]!.toUpperCase()}${parts[0]!.slice(1)}, and ${parts[1]}. Confirm to request a single approval covering both.`;
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

export function formatReceivedInAccount(account: string): string {
  return account;
}

export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Inclusive last-30-days window ending today (UTC date-only). */
export function defaultPaymentsDateRange(): { dateFrom: string; dateTo: string } {
  const dateTo = toDateOnly(new Date());
  const dateFrom = new Date(dateTo);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 29);
  return {
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: dateTo.toISOString().slice(0, 10),
  };
}
