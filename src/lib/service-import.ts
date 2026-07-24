import { ServiceStatus } from "@prisma/client";
import { normalizeMobileNumber, roundMoney } from "@/lib/service";

/** Template column headers matching the current service spreadsheet (PRD §15). */
export const SERVICE_IMPORT_TEMPLATE_HEADERS = [
  "#",
  "Date",
  "Customer Name",
  "Mobile Number",
  "Consumer #",
  "Work Type",
  "Customer Request",
  "Status",
  "Fees",
  "Amount Received",
  "Pending Amount",
  "Delay Days",
  "Delayed Notes",
] as const;

/** Raw canonical field keys after header mapping. */
export type ServiceImportField =
  | "serial"
  | "date"
  | "customerName"
  | "mobileNumber"
  | "consumerNumber"
  | "workType"
  | "customerRequest"
  | "status"
  | "fees"
  | "amountReceived"
  | "pendingAmount"
  | "delayDays"
  | "delayedNotes";

/** Map a spreadsheet header to a canonical field, or null when unrecognized. */
export function mapServiceImportHeader(raw: string): ServiceImportField | null {
  const trimmed = raw.trim().toLowerCase();
  if (["#", "no", "no.", "sr", "sr no", "sr.no", "s.no", "sno", "serial", "srno"].includes(trimmed)) {
    return "serial";
  }
  const key = trimmed.replace(/[^a-z0-9]/g, "");
  switch (key) {
    case "date":
      return "date";
    case "customername":
    case "customer":
    case "name":
      return "customerName";
    case "mobile":
    case "mobileno":
    case "mobilenumber":
    case "phone":
    case "contact":
      return "mobileNumber";
    case "consumer":
    case "consumerno":
    case "consumernumber":
    case "consumerid":
      return "consumerNumber";
    case "worktype":
    case "work":
    case "type":
      return "workType";
    case "customerrequest":
    case "request":
    case "complaint":
    case "customercomplaint":
    case "requestcomplaint":
      return "customerRequest";
    case "status":
      return "status";
    case "fees":
    case "fee":
    case "totalfees":
      return "fees";
    case "amountreceived":
    case "received":
    case "amountrecd":
    case "recd":
    case "paid":
      return "amountReceived";
    case "pendingamount":
    case "pending":
    case "balance":
      return "pendingAmount";
    case "delaydays":
    case "delay":
    case "delays":
      return "delayDays";
    case "delayednotes":
    case "delaynotes":
    case "delayednote":
    case "notes":
    case "note":
    case "remark":
    case "remarks":
      return "delayedNotes";
    default:
      return null;
  }
}

const STATUS_ALIASES: Record<string, ServiceStatus> = {
  open: ServiceStatus.OPEN,
  new: ServiceStatus.OPEN,
  assigned: ServiceStatus.ASSIGNED,
  inprogress: ServiceStatus.IN_PROGRESS,
  progress: ServiceStatus.IN_PROGRESS,
  working: ServiceStatus.IN_PROGRESS,
  waiting: ServiceStatus.WAITING,
  hold: ServiceStatus.WAITING,
  onhold: ServiceStatus.WAITING,
  pending: ServiceStatus.WAITING,
  completed: ServiceStatus.COMPLETED,
  complete: ServiceStatus.COMPLETED,
  done: ServiceStatus.COMPLETED,
  closed: ServiceStatus.CLOSED,
  close: ServiceStatus.CLOSED,
  cancelled: ServiceStatus.CANCELLED,
  canceled: ServiceStatus.CANCELLED,
  reopened: ServiceStatus.REOPENED,
  reopen: ServiceStatus.REOPENED,
};

/** Parse a status label. Returns null for unrecognized non-empty values. */
export function parseServiceImportStatus(value: string | undefined): ServiceStatus | null {
  if (!value || !value.trim()) return ServiceStatus.OPEN;
  const key = value.trim().toLowerCase().replace(/[^a-z]/g, "");
  return STATUS_ALIASES[key] ?? null;
}

/** Parse a money/number cell, stripping currency symbols and separators. */
export function parseServiceImportNumber(value: string | undefined): number | null {
  if (value == null || !String(value).trim()) return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Parse a date cell into an ISO date string (yyyy-mm-dd), or null if invalid. */
export function parseServiceImportDate(value: string | undefined): string | null {
  if (!value || !String(value).trim()) {
    return new Date().toISOString().slice(0, 10);
  }
  const raw = String(value).trim();

  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export type ServiceImportInput = {
  rowNumber: number;
  serial?: string;
  date?: string;
  customerName?: string;
  mobileNumber?: string;
  consumerNumber?: string;
  workType?: string;
  customerRequest?: string;
  status?: string;
  fees?: string;
  amountReceived?: string;
  pendingAmount?: string;
  delayDays?: string;
  delayedNotes?: string;
};

export type ServiceImportNormalized = {
  rowNumber: number;
  importReference: string | null;
  requestDate: string;
  customerName: string;
  mobileNumber: string | null;
  consumerNumber: string | null;
  workTypeName: string;
  matchedWorkType: boolean;
  customerRequest: string;
  status: ServiceStatus;
  totalFees: number;
  amountReceived: number;
  delayedNotes: string | null;
};

export type ServiceImportPreviewRow = ServiceImportNormalized & {
  isValid: boolean;
  errors: string[];
};

/**
 * Validate and normalize a single import row. Pure — the set of known (lower-cased)
 * work type names lets it decide whether a row maps to a master work type or is
 * stored as a custom label. Mobile number is optional for imported history.
 */
export function validateServiceImportRow(
  input: ServiceImportInput,
  knownWorkTypeNames: Set<string>,
): ServiceImportPreviewRow {
  const errors: string[] = [];

  const customerName = (input.customerName ?? "").trim();
  if (customerName.length < 2) errors.push("Customer name is required.");

  const workTypeName = (input.workType ?? "").trim();
  if (!workTypeName) errors.push("Work type is required.");

  const status = parseServiceImportStatus(input.status);
  if (status === null) errors.push(`Unknown status "${input.status}".`);

  const requestDate = parseServiceImportDate(input.date);
  if (requestDate === null) errors.push(`Invalid date "${input.date}".`);

  const totalFees = parseServiceImportNumber(input.fees);
  if (totalFees === null) errors.push(`Invalid fees "${input.fees}".`);

  const amountReceived = parseServiceImportNumber(input.amountReceived);
  if (amountReceived === null) errors.push(`Invalid amount received "${input.amountReceived}".`);

  const mobileDigits = input.mobileNumber ? normalizeMobileNumber(input.mobileNumber) : "";

  const customerRequest = (input.customerRequest ?? "").trim() || "(imported record)";
  const delayedNotes = (input.delayedNotes ?? "").trim() || null;
  const serial = (input.serial ?? "").trim() || null;

  return {
    rowNumber: input.rowNumber,
    importReference: serial,
    requestDate: requestDate ?? new Date().toISOString().slice(0, 10),
    customerName,
    mobileNumber: mobileDigits || null,
    consumerNumber: (input.consumerNumber ?? "").trim() || null,
    workTypeName,
    matchedWorkType: knownWorkTypeNames.has(workTypeName.toLowerCase()),
    customerRequest,
    status: status ?? ServiceStatus.OPEN,
    totalFees: roundMoney(totalFees ?? 0),
    amountReceived: roundMoney(amountReceived ?? 0),
    delayedNotes,
    isValid: errors.length === 0,
    errors,
  };
}
