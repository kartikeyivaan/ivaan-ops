/** Pure helpers for PI trade-credit (pay-after-dispatch) rules. */

import { isOutstandingWithinTolerance } from "@/lib/proforma-invoices";
import { toDateOnly } from "@/lib/proforma-invoices";

export const PI_CREDIT_DUE_DAYS = 7;
/** First reminder day after credit approval (1-based calendar days from approval). */
export const PI_CREDIT_REMINDER_START_DAY = 3;

export const PI_CREDIT_ACTIVE_STATUSES = ["APPROVED"] as const;

export const PI_CREDIT_PENDING_STATUSES = ["PENDING_SM", "PENDING_ACCOUNTS"] as const;

export function hasApprovedPiCredit(creditStatus: string | null | undefined): boolean {
  return creditStatus === "APPROVED";
}

export function isPiCreditPending(creditStatus: string | null | undefined): boolean {
  return creditStatus === "PENDING_SM" || creditStatus === "PENDING_ACCOUNTS";
}

export function canRequestPiCreditOnStatus(
  piStatus: string,
  creditStatus: string,
  outstanding: number,
): boolean {
  if (outstanding <= 0 || isOutstandingWithinTolerance(outstanding)) return false;
  if (
    piStatus !== "ISSUED" &&
    piStatus !== "PENDING_BOOKING" &&
    piStatus !== "BOOKED" &&
    piStatus !== "PARTIALLY_DISPATCHED"
  ) {
    return false;
  }
  return (
    creditStatus === "NONE" ||
    creditStatus === "REJECTED" ||
    creditStatus === "CLEARED"
  );
}

export function computeCreditDueDate(approvedAt: Date = new Date()): Date {
  const due = toDateOnly(approvedAt);
  due.setUTCDate(due.getUTCDate() + PI_CREDIT_DUE_DAYS);
  return due;
}

/** Calendar days elapsed since approval date (0 = approval day). */
export function creditDaysSinceApproval(
  approvedAt: string | Date,
  today: string | Date = new Date(),
): number | null {
  const approved =
    typeof approvedAt === "string"
      ? approvedAt.slice(0, 10)
      : toDateOnly(approvedAt).toISOString().slice(0, 10);
  const todayString =
    typeof today === "string" ? today.slice(0, 10) : toDateOnly(today).toISOString().slice(0, 10);
  const approvedMs = Date.parse(`${approved}T00:00:00.000Z`);
  const todayMs = Date.parse(`${todayString}T00:00:00.000Z`);
  if (Number.isNaN(approvedMs) || Number.isNaN(todayMs)) return null;
  return Math.round((todayMs - approvedMs) / 86_400_000);
}

export function shouldSendCreditReminder(input: {
  creditStatus: string;
  outstanding: number;
  accountsApprovedAt: string | Date | null | undefined;
  lastReminderOn: string | Date | null | undefined;
  today?: string | Date;
}): boolean {
  if (!hasApprovedPiCredit(input.creditStatus)) return false;
  if (isOutstandingWithinTolerance(input.outstanding)) return false;
  if (!input.accountsApprovedAt) return false;

  const today = input.today ?? new Date();
  const days = creditDaysSinceApproval(input.accountsApprovedAt, today);
  if (days == null || days < PI_CREDIT_REMINDER_START_DAY) return false;

  const todayString =
    typeof today === "string" ? today.slice(0, 10) : toDateOnly(today).toISOString().slice(0, 10);
  if (!input.lastReminderOn) return true;
  const last =
    typeof input.lastReminderOn === "string"
      ? input.lastReminderOn.slice(0, 10)
      : toDateOnly(input.lastReminderOn).toISOString().slice(0, 10);
  return last < todayString;
}

export function isCreditOverdue(input: {
  creditStatus: string;
  outstanding: number;
  dueDate: string | Date | null | undefined;
  today?: string | Date;
}): boolean {
  if (!hasApprovedPiCredit(input.creditStatus)) return false;
  if (isOutstandingWithinTolerance(input.outstanding)) return false;
  if (!input.dueDate) return false;
  const today = input.today ?? new Date();
  const due =
    typeof input.dueDate === "string"
      ? input.dueDate.slice(0, 10)
      : toDateOnly(input.dueDate).toISOString().slice(0, 10);
  const todayString =
    typeof today === "string" ? today.slice(0, 10) : toDateOnly(today).toISOString().slice(0, 10);
  return due < todayString;
}

export function formatPiCreditStatus(status: string): string {
  switch (status) {
    case "NONE":
      return "None";
    case "PENDING_SM":
      return "Pending Sales Manager";
    case "PENDING_ACCOUNTS":
      return "Pending Accounts";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "CLEARED":
      return "Cleared";
    default:
      return status
        .split("_")
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(" ");
  }
}
