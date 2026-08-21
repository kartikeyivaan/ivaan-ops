import { defaultBusinessReportDateRange } from "@/lib/business-dates";
import { roundMoney } from "@/lib/quotations";

export type AgeingBucket = "0-30" | "31-60" | "61-90" | "90+";

export function calculateFreeQty(
  available: number,
  booked: number,
  upcomingStock = 0,
): number {
  return Math.max(0, available - booked + upcomingStock);
}

export function calculateOutstanding(piValue: number, paid: number): number {
  return roundMoney(Math.max(0, piValue - paid));
}

export function calculateAgeingDays(piDate: string | Date, asOf = new Date()): number {
  const start = typeof piDate === "string" ? new Date(piDate) : piDate;
  const diff = asOf.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function getAgeingBucket(days: number): AgeingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function matchesAgeingBucket(days: number, bucket?: string): boolean {
  if (!bucket) return true;
  return getAgeingBucket(days) === bucket;
}

export function parseReportDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function endOfReportDay(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function defaultReportDateRange(): { fromDate: string; toDate: string } {
  return defaultBusinessReportDateRange();
}

export function sumMovementClosing(input: {
  opening: number;
  incoming: number;
  transfersIn: number;
  booked: number;
  damaged: number;
  dispatched: number;
  transfersOut: number;
}): number {
  return (
    input.opening +
    input.incoming +
    input.transfersIn -
    input.booked -
    input.damaged -
    input.dispatched -
    input.transfersOut
  );
}
