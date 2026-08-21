import type { DashboardPeriod } from "@/lib/business-dates";
import type { AgeingBucket } from "@/lib/reports";

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
  custom: "Custom Range",
};

export const AGEING_BUCKET_LABELS: Record<AgeingBucket, string> = {
  "0-30": "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

export function formatBusinessDateLong(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export function formatBusinessMonthYear(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export function getBusinessGreeting(asOf = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(asOf),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatCompactNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);
}

/** Format Actual / Counted pair for incentive-aware KPIs. */
export function formatActualCounted(
  actual: number,
  counted: number,
  format: (value: number) => string = formatCompactNumber,
): string {
  return `${format(actual)} / ${format(counted)}`;
}

/** Dashboard money display: amount in Lakh INR (1 Lakh = ₹1,00,000). */
export function formatCurrency(value: number): string {
  const lakhs = value / 100_000;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(lakhs);
  return `₹${formatted} Lakh`;
}

export function formatChangePercent(changePercent: number | null): string | null {
  if (changePercent === null) return null;
  const sign = changePercent >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(changePercent)}% vs previous period`;
}

export function buildKpiHref(
  kind: "quotation" | "pi" | "collection" | "dispatch" | "modules",
  fromDate: string,
  toDate: string,
  salesUserId?: string,
): string {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (salesUserId) params.set("salesUserId", salesUserId);

  switch (kind) {
    case "quotation":
      return `/sales/quotations${params.size ? `?${params}` : ""}`;
    case "pi":
      return `/sales/proforma-invoices${params.size ? `?${params}` : ""}`;
    case "collection": {
      params.set("report", "payment-followup");
      return `/reports?${params}`;
    }
    case "dispatch":
    case "modules": {
      params.set("report", "dispatch");
      return `/reports?${params}`;
    }
  }
}

export function buildExpiringQuotationsHref(salesUserId?: string): string {
  const params = new URLSearchParams();
  params.set("expiry", "soon");
  if (salesUserId) params.set("salesUserId", salesUserId);
  return `/sales/quotations?${params}`;
}

export function buildUnpaidPisHref(salesUserId?: string): string {
  const params = new URLSearchParams();
  params.set("outstandingOnly", "true");
  if (salesUserId) params.set("salesUserId", salesUserId);
  return `/sales/proforma-invoices?${params}`;
}

export function buildTodayDispatchHref(salesUserId?: string): string {
  const params = new URLSearchParams();
  params.set(
    "fromDate",
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  params.set(
    "toDate",
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  if (salesUserId) params.set("salesUserId", salesUserId);
  return `/inventory/dispatches/challans?${params}`;
}
