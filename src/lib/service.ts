import {
  ServiceStatus,
  ServicePriority,
  ServiceWaitingReason,
  ServiceSystemStatus,
  ServiceComplaintSource,
  ServiceCompletionSystemStatus,
  ServiceCustomerConfirmation,
  ServiceUpdateType,
  ServiceContactMode,
  ServiceVisitStatus,
  ServicePaymentMode,
  type PrismaClient,
  type Prisma,
} from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";
import { addDays, roundMoney, toDateOnly } from "@/lib/quotations";

/** Company code the Service module is bound to (Ivaan Solar Energy only). */
export const SERVICE_COMPANY_CODE = "ISE";

export const SERVICE_DOCUMENT_TYPE = "SERVICE";

export { roundMoney, toDateOnly, addDays };

/**
 * Allowed status transitions (PRD §7.2). A status maps to the set of statuses it
 * may move to. CANCELLED is terminal.
 */
export const SERVICE_STATUS_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  [ServiceStatus.OPEN]: [
    ServiceStatus.ASSIGNED,
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.CANCELLED,
  ],
  [ServiceStatus.ASSIGNED]: [
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.WAITING,
    ServiceStatus.COMPLETED,
    ServiceStatus.CANCELLED,
  ],
  [ServiceStatus.IN_PROGRESS]: [
    ServiceStatus.WAITING,
    ServiceStatus.COMPLETED,
    ServiceStatus.CANCELLED,
  ],
  [ServiceStatus.WAITING]: [
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.COMPLETED,
    ServiceStatus.CANCELLED,
  ],
  [ServiceStatus.COMPLETED]: [ServiceStatus.CLOSED, ServiceStatus.REOPENED],
  [ServiceStatus.CLOSED]: [ServiceStatus.REOPENED],
  [ServiceStatus.REOPENED]: [
    ServiceStatus.ASSIGNED,
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.WAITING,
    ServiceStatus.COMPLETED,
  ],
  [ServiceStatus.CANCELLED]: [],
};

export function getNextServiceStatuses(current: ServiceStatus): ServiceStatus[] {
  return SERVICE_STATUS_TRANSITIONS[current] ?? [];
}

/**
 * Statuses handled by dedicated actions (Complete / Close / Reopen) rather than
 * the generic status-change flow (PRD §7.2, §11).
 */
export const SERVICE_DEDICATED_ACTION_STATUSES: ServiceStatus[] = [
  ServiceStatus.COMPLETED,
  ServiceStatus.CLOSED,
  ServiceStatus.REOPENED,
];

/** Valid next statuses reachable through the generic "Change Status" action. */
export function getManualNextServiceStatuses(current: ServiceStatus): ServiceStatus[] {
  return getNextServiceStatuses(current).filter(
    (status) => !SERVICE_DEDICATED_ACTION_STATUSES.includes(status),
  );
}

export function isValidServiceStatusTransition(
  from: ServiceStatus,
  to: ServiceStatus,
): boolean {
  return getNextServiceStatuses(from).includes(to);
}

/** Statuses that require a mandatory note (PRD §7.2). */
export function statusRequiresNote(status: ServiceStatus): boolean {
  return (
    status === ServiceStatus.WAITING ||
    status === ServiceStatus.COMPLETED ||
    status === ServiceStatus.CANCELLED ||
    status === ServiceStatus.REOPENED
  );
}

export function statusRequiresWaitingReason(status: ServiceStatus): boolean {
  return status === ServiceStatus.WAITING;
}

/** Terminal statuses that block further ordinary edits/transitions. */
export function isTerminalServiceStatus(status: ServiceStatus): boolean {
  return status === ServiceStatus.CANCELLED;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Pending = max(0, totalFees - sum of payments). Never negative (PRD §19). */
export function calculatePendingAmount(
  totalFees: number,
  amountReceived: number,
): number {
  return roundMoney(Math.max(0, totalFees - amountReceived));
}

// ---------------------------------------------------------------------------
// Delay tracking (PRD §20)
// ---------------------------------------------------------------------------

export type DelayStatus = "ON_TRACK" | "DUE_TODAY" | "DELAYED";

export type DelayResult = {
  delayDays: number;
  delayStatus: DelayStatus | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateOnlyDiffInDays(later: Date, earlier: Date): number {
  const a = toDateOnly(later).getTime();
  const b = toDateOnly(earlier).getTime();
  return Math.round((a - b) / MS_PER_DAY);
}

/**
 * Delay calculation. For open requests uses the current date; for closed
 * requests uses the closed date; for completed uses the completion date.
 * Cancelled requests never show delay. Returns null delayStatus when there is
 * no target date.
 */
export function calculateServiceDelay(input: {
  targetCompletionDate: Date | null;
  status: ServiceStatus;
  closedDate?: Date | null;
  completionDate?: Date | null;
  now?: Date;
}): DelayResult {
  const now = input.now ?? new Date();

  if (!input.targetCompletionDate) {
    return { delayDays: 0, delayStatus: null };
  }
  if (input.status === ServiceStatus.CANCELLED) {
    return { delayDays: 0, delayStatus: null };
  }

  let reference: Date;
  if (input.status === ServiceStatus.CLOSED && input.closedDate) {
    reference = input.closedDate;
  } else if (input.status === ServiceStatus.COMPLETED && input.completionDate) {
    reference = input.completionDate;
  } else {
    reference = now;
  }

  const diff = dateOnlyDiffInDays(reference, input.targetCompletionDate);
  const delayDays = Math.max(0, diff);

  let delayStatus: DelayStatus;
  if (delayDays > 0) {
    delayStatus = "DELAYED";
  } else if (diff === 0) {
    delayStatus = "DUE_TODAY";
  } else {
    delayStatus = "ON_TRACK";
  }

  return { delayDays, delayStatus };
}

/** Suggest a target completion date from an assignment date + work type days. */
export function suggestTargetCompletionDate(
  assignedDate: Date,
  defaultTargetDays: number | null | undefined,
): Date | null {
  if (defaultTargetDays == null || defaultTargetDays <= 0) return null;
  return toDateOnly(addDays(assignedDate, defaultTargetDays));
}

// ---------------------------------------------------------------------------
// Mobile / consumer number handling (PRD §8.5, §8.6)
// ---------------------------------------------------------------------------

/** Strip spaces and formatting, keep digits only. */
export function normalizeMobileNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/** Accept 10-digit Indian mobile numbers (leading 6-9). */
export function isValidIndianMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobileNumber(value));
}

export function normalizeConsumerNumber(value: string): string {
  return value.trim();
}

// ---------------------------------------------------------------------------
// Service request numbering (PRD §6) — reuses DocumentSequence infrastructure.
// Format: {companyCode}-SRV-{fy}-{00001}, e.g. ISE-SRV-26-27-00001
// ---------------------------------------------------------------------------

export async function generateServiceRequestNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = SERVICE_DOCUMENT_TYPE;

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

  return `${companyCode}-SRV-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  REOPENED: "Reopened",
};

export const SERVICE_PRIORITY_LABELS: Record<ServicePriority, string> = {
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const SERVICE_WAITING_REASON_LABELS: Record<ServiceWaitingReason, string> = {
  MATERIAL_REQUIRED: "Material Required",
  CUSTOMER_RESPONSE: "Customer Response",
  CUSTOMER_AVAILABILITY: "Customer Availability",
  PAYMENT: "Payment",
  EXTERNAL_AGENCY: "External Agency",
  INTERNAL_APPROVAL: "Internal Approval",
  OTHER: "Other",
};

export const SERVICE_SYSTEM_STATUS_LABELS: Record<ServiceSystemStatus, string> = {
  WORKING: "Working",
  PARTIALLY_WORKING: "Partially Working",
  NOT_WORKING: "Not Working",
  NOT_CHECKED: "Not Checked",
};

export const SERVICE_COMPLETION_SYSTEM_STATUS_LABELS: Record<
  ServiceCompletionSystemStatus,
  string
> = {
  WORKING: "Working",
  PARTIALLY_WORKING: "Partially Working",
  NOT_APPLICABLE: "Not Applicable",
};

export const SERVICE_COMPLAINT_SOURCE_LABELS: Record<ServiceComplaintSource, string> = {
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  OFFICE_VISIT: "Office Visit",
  SITE_VISIT: "Site Visit",
  INTERNAL: "Internal",
  OTHER: "Other",
};

export const SERVICE_CUSTOMER_CONFIRMATION_LABELS: Record<
  ServiceCustomerConfirmation,
  string
> = {
  CONFIRMED_VERBALLY: "Confirmed verbally",
  CONFIRMED_WHATSAPP: "Confirmed on WhatsApp",
  SIGNATURE_PHOTO: "Customer signature/photo",
  NOT_AVAILABLE: "Not available",
  NOT_REQUIRED: "Not required",
};

export const SERVICE_UPDATE_TYPE_LABELS: Record<ServiceUpdateType, string> = {
  CREATED: "Request Created",
  EDITED: "Request Edited",
  ASSIGNMENT: "Assignment Changed",
  STATUS_CHANGE: "Status Changed",
  CUSTOMER_CONTACTED: "Customer Contacted",
  VISIT_SCHEDULED: "Visit Scheduled",
  SITE_VISIT_COMPLETED: "Site Visit Completed",
  WORK_UPDATE: "Work Update",
  MATERIAL_REQUIRED: "Material Required",
  PAYMENT_FOLLOWUP: "Payment Follow-up",
  PAYMENT_RECORDED: "Payment Recorded",
  COMPLETION: "Work Completed",
  GENERAL_NOTE: "General Note",
};

/** Update types a user may pick in the Add Update flow (PRD §16). */
export const SERVICE_USER_UPDATE_TYPES: ServiceUpdateType[] = [
  ServiceUpdateType.CUSTOMER_CONTACTED,
  ServiceUpdateType.VISIT_SCHEDULED,
  ServiceUpdateType.SITE_VISIT_COMPLETED,
  ServiceUpdateType.WORK_UPDATE,
  ServiceUpdateType.MATERIAL_REQUIRED,
  ServiceUpdateType.PAYMENT_FOLLOWUP,
  ServiceUpdateType.GENERAL_NOTE,
];

export const SERVICE_CONTACT_MODE_LABELS: Record<ServiceContactMode, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  OFFICE_VISIT: "Office Visit",
  OTHER: "Other",
};

export const SERVICE_VISIT_STATUS_LABELS: Record<ServiceVisitStatus, string> = {
  SCHEDULED: "Scheduled",
  RESCHEDULED: "Rescheduled",
  COMPLETED: "Completed",
  CUSTOMER_UNAVAILABLE: "Customer Unavailable",
  CANCELLED: "Cancelled",
  FOLLOWUP_REQUIRED: "Follow-up Required",
};

export const SERVICE_PAYMENT_MODE_LABELS: Record<ServicePaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export function formatServiceStatus(status: ServiceStatus): string {
  return SERVICE_STATUS_LABELS[status] ?? status;
}

export function formatServicePriority(priority: ServicePriority): string {
  return SERVICE_PRIORITY_LABELS[priority] ?? priority;
}

/** Badge variant hint for a status (aligns with the ui Badge variants). */
export function serviceStatusBadgeVariant(
  status: ServiceStatus,
): "default" | "success" | "warning" | "danger" {
  switch (status) {
    case ServiceStatus.COMPLETED:
    case ServiceStatus.CLOSED:
      return "success";
    case ServiceStatus.WAITING:
    case ServiceStatus.REOPENED:
      return "warning";
    case ServiceStatus.CANCELLED:
      return "danger";
    default:
      return "default";
  }
}

export function servicePriorityBadgeVariant(
  priority: ServicePriority,
): "default" | "success" | "warning" | "danger" {
  switch (priority) {
    case ServicePriority.URGENT:
      return "danger";
    case ServicePriority.HIGH:
      return "warning";
    default:
      return "default";
  }
}
