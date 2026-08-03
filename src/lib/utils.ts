import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parseDateOnly(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (value.includes("T")) return new Date(value);
  return new Date(`${value}T00:00:00.000Z`);
}

/** e.g. 10 Jan 2026 — for quotations, PIs, and delivery challans */
export function formatDocumentDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDateOnly(value));
}

/** e.g. 03-08-26 — for recorded payment dates */
export function formatPaymentDate(value: Date | string): string {
  const date = parseDateOnly(value);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}
