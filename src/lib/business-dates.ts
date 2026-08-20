export const BUSINESS_TIMEZONE = "Asia/Kolkata";

export type DashboardPeriod = "today" | "week" | "month" | "quarter" | "custom";

/** YYYY-MM-DD in Asia/Kolkata for the given instant. */
export function getBusinessToday(asOf = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(asOf);
}

export function parseBusinessDateString(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDaysToDateString(value: string, days: number): string {
  const date = parseBusinessDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** UTC Date at midnight for a business calendar day (matches existing @db.Date queries). */
export function parseBusinessDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function endOfBusinessDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

export function getBusinessMonthRange(
  asOf = new Date(),
  year?: number,
  month?: number,
): { fromDate: string; toDate: string; year: number; month: number } {
  const today = getBusinessToday(asOf);
  const resolved =
    year != null && month != null
      ? { year, month }
      : parseBusinessDateString(today);

  const fromDate = `${resolved.year}-${pad2(resolved.month)}-01`;
  const lastDay = daysInMonth(resolved.year, resolved.month);
  const monthEnd = `${resolved.year}-${pad2(resolved.month)}-${pad2(lastDay)}`;
  const toDate = year != null && month != null ? monthEnd : today;

  return { fromDate, toDate, year: resolved.year, month: resolved.month };
}

/** ISO week starts Monday in business timezone. */
export function getBusinessWeekRange(asOf = new Date()): { fromDate: string; toDate: string } {
  const today = getBusinessToday(asOf);
  const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = addDaysToDateString(today, mondayOffset);
  return { fromDate: monday, toDate: today };
}

export function getBusinessQuarterRange(asOf = new Date()): { fromDate: string; toDate: string } {
  const today = getBusinessToday(asOf);
  const { year, month } = parseBusinessDateString(today);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const fromDate = `${year}-${pad2(quarterStartMonth)}-01`;
  return { fromDate, toDate: today };
}

export function resolveDashboardPeriod(
  period: DashboardPeriod,
  custom?: { fromDate?: string; toDate?: string },
  asOf = new Date(),
): { fromDate: string; toDate: string; period: DashboardPeriod } {
  if (period === "custom" && custom?.fromDate && custom?.toDate) {
    return { fromDate: custom.fromDate, toDate: custom.toDate, period };
  }
  if (period === "today") {
    const today = getBusinessToday(asOf);
    return { fromDate: today, toDate: today, period };
  }
  if (period === "week") {
    const range = getBusinessWeekRange(asOf);
    return { ...range, period };
  }
  if (period === "quarter") {
    const range = getBusinessQuarterRange(asOf);
    return { ...range, period };
  }
  const range = getBusinessMonthRange(asOf);
  return { fromDate: range.fromDate, toDate: range.toDate, period: "month" };
}

export function getPreviousPeriodRange(fromDate: string, toDate: string): {
  fromDate: string;
  toDate: string;
} {
  const start = parseBusinessDate(fromDate);
  const end = parseBusinessDate(toDate);
  const dayCount =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = addDaysToDateString(fromDate, -1);
  const prevStart = addDaysToDateString(prevEnd, -(dayCount - 1));
  return { fromDate: prevStart, toDate: prevEnd };
}

export function defaultBusinessReportDateRange(asOf = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const { fromDate, toDate } = getBusinessMonthRange(asOf);
  return { fromDate, toDate };
}
