import * as XLSX from "xlsx";

/** Shared parsing helpers for bank statement spreadsheets. */

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function normalizeHeaderKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseStatementAmount(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);
  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "—") return 0;
  const cleaned = raw.replace(/[₹,\s()]/g, "").replace(/^-/, "");
  if (!cleaned) return 0;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.abs(num);
}

export function parseStatementDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (days since 1899-12-30)
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + value * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  const text = String(value).trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(text);
  if (dmy) {
    return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  }

  // DD Mon YYYY / DD-Mon-YYYY (SBI PDF/Excel style)
  const mon = /^(\d{1,2})[\s\-\/]+([A-Za-z]{3,9})[\s\-\/]+(\d{4})$/.exec(text);
  if (mon) {
    const month = MONTHS[mon[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(Date.UTC(Number(mon[3]), month, Number(mon[1])));
    }
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function extractDigitsAccountNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 ? digits : null;
}

/**
 * Pull UTR / cheque / transfer reference from SBI narration when Ref column is empty.
 */
export function extractReferenceFromNarration(narration: string): string | null {
  const text = narration.trim();
  if (!text) return null;

  const patterns = [
    /\bUTR[:\s\-]*([A-Z0-9]{12,22})\b/i,
    /\b(?:NEFT|RTGS|IMPS)[\s\-]*(?:CR|DR)?[\s\-]*([A-Z0-9]{12,22})\b/i,
    /\b(SBIN\d{10,})\b/i,
    /\b([A-Z]{4}\d{10,})\b/,
    /\bUPI[\/\-]([0-9]{10,})\b/i,
    /\b(?:CHQ|CHEQUE)[\s\-#:]*([0-9]{5,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

export function sheetRowsFromWorkbook(workbook: XLSX.WorkBook): {
  sheetName: string;
  rows: unknown[][];
} {
  const sheetName = workbook.SheetNames[0] ?? "";
  if (!sheetName) {
    return { sheetName: "", rows: [] };
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
  });
  return { sheetName, rows };
}

export function readWorkbookFromPath(tempFilePath: string): XLSX.WorkBook {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  const buffer = fs.readFileSync(tempFilePath);
  return XLSX.read(buffer, { type: "buffer", raw: true, cellDates: true });
}
