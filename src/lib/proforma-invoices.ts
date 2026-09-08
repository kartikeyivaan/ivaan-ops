import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getBusinessToday, parseBusinessDateString } from "@/lib/business-dates";
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
  options?: { hasApprovedCredit?: boolean },
): boolean {
  if (!requirement.allowed) return false;
  if (options?.hasApprovedCredit) return true;
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
  "CLOSED_PARTIAL",
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

/** Remaining ordered qty that is still booked after confirmed dispatches. */
export function getPiRemainingQty(qty: number, dispatchedQty: number): number {
  return Math.max(0, qty - dispatchedQty);
}

/**
 * Partially dispatched PIs may be closed when leftover qty cannot ship
 * (pallet / vehicle capacity). Remaining booked qty is then released.
 */
export function canClosePartialDispatchPi(input: { status: string }): boolean {
  return input.status === "PARTIALLY_DISPATCHED";
}

/** Statuses that stay on the sales Pending Dispatch list. */
export const PENDING_DISPATCH_LIST_STATUSES = [
  "BOOKED",
  "PARTIALLY_DISPATCHED",
  "CANCEL_PENDING",
] as const;

export function isPendingDispatchListStatus(status: string): boolean {
  return (PENDING_DISPATCH_LIST_STATUSES as readonly string[]).includes(status);
}

export function dispatchQueueClearData() {
  return {
    dispatchQueuedAt: null as Date | null,
    dispatchQueuedById: null as string | null,
  };
}

/**
 * Inclusive window for sales historic / same-day DC dates:
 * first day of last calendar month through today (Asia/Kolkata).
 */
export function historicDispatchDateWindow(asOf = new Date()): {
  min: string;
  max: string;
} {
  const today = getBusinessToday(asOf);
  const { year, month } = parseBusinessDateString(today);
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  return {
    min: `${lastMonthYear}-${String(lastMonth).padStart(2, "0")}-01`,
    max: today,
  };
}

export function isHistoricDispatchDateAllowed(
  date: string,
  asOf = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const window = historicDispatchDateWindow(asOf);
  return date >= window.min && date <= window.max;
}

export function daysOnPendingDispatch(
  queuedAt: string | Date | null | undefined,
  today: string | Date = new Date(),
): number | null {
  if (!queuedAt) return null;
  const queuedDate =
    typeof queuedAt === "string" ? queuedAt.slice(0, 10) : getBusinessToday(queuedAt);
  const todayDate = typeof today === "string" ? today.slice(0, 10) : getBusinessToday(today);
  const waiting = daysUntilCommittedDispatch(todayDate, queuedDate);
  return waiting == null ? null : Math.max(0, waiting);
}

export function canRecordQueuedDispatchOnPi(input: {
  status: string;
  hasOpenDispatchDraft: boolean;
}): boolean {
  if (input.hasOpenDispatchDraft) return false;
  return input.status === "BOOKED" || input.status === "PARTIALLY_DISPATCHED";
}

export function canRequestCancelFromPendingDispatch(input: {
  status: string;
  hasOpenDispatchDraft: boolean;
}): boolean {
  if (input.hasOpenDispatchDraft) return false;
  return input.status === "BOOKED";
}

export function canCloseFromPendingDispatch(input: {
  status: string;
  hasOpenDispatchDraft: boolean;
}): boolean {
  if (input.hasOpenDispatchDraft) return false;
  return canClosePartialDispatchPi(input);
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

/** Warehouse Dispatch Today stays live this long after the mark, if not yet dispatched. */
export const DISPATCH_TODAY_TTL_HOURS = 48;
const DISPATCH_TODAY_TTL_MS = DISPATCH_TODAY_TTL_HOURS * 60 * 60 * 1000;

export function getDispatchTodayCutoff(now = new Date()): Date {
  return new Date(now.getTime() - DISPATCH_TODAY_TTL_MS);
}

function toInstant(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

export function isDispatchTodayActive(
  dispatchTodayDate: string | Date | null | undefined,
  now: string | Date = new Date(),
  markedAt?: string | Date | null,
): boolean {
  if (!dispatchTodayDate && (markedAt == null || markedAt === "")) return false;
  const created =
    markedAt != null && markedAt !== ""
      ? toInstant(markedAt)
      : dispatchTodayDate
        ? toInstant(dispatchTodayDate)
        : null;
  if (!created || Number.isNaN(created.getTime())) return false;
  const nowDate = toInstant(now);
  if (Number.isNaN(nowDate.getTime())) return false;
  const ageMs = nowDate.getTime() - created.getTime();
  return ageMs >= 0 && ageMs < DISPATCH_TODAY_TTL_MS;
}

/** Prisma where: mark still within the 48-hour window (or same calendar day if markedAt is missing). */
export function dispatchTodayActiveWhere(now = new Date()) {
  const cutoff = getDispatchTodayCutoff(now);
  const today = toDateOnly(now);
  return {
    dispatchTodayDate: { not: null },
    OR: [
      { dispatchTodayMarkedAt: { gte: cutoff } },
      { AND: [{ dispatchTodayMarkedAt: null }, { dispatchTodayDate: today }] },
    ],
  };
}

/** Prisma where: mark older than 48 hours (legacy rows without markedAt still expire overnight). */
export function dispatchTodayExpiredWhere(now = new Date()) {
  const cutoff = getDispatchTodayCutoff(now);
  const today = toDateOnly(now);
  return {
    dispatchTodayDate: { not: null },
    OR: [
      { dispatchTodayMarkedAt: { lt: cutoff } },
      { AND: [{ dispatchTodayMarkedAt: null }, { dispatchTodayDate: { lt: today } }] },
    ],
  };
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
  if (status === "CLOSED_PARTIAL") return "Closed (Partial Dispatch)";
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
