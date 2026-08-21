import type { AuditAction, Prisma } from "@prisma/client";
import { writeAuditLog, writeAuditLogTx } from "@/lib/audit";

/**
 * Command 15 banking audit event types.
 * Stored as `reason` (human label) and mirrored in `newValue.eventType` for filtering.
 */
export const BANKING_AUDIT_EVENTS = {
  IMPORT_STARTED: "IMPORT_STARTED",
  IMPORT_PREVIEW_READY: "IMPORT_PREVIEW_READY",
  IMPORT_FAILED: "IMPORT_FAILED",
  IMPORT_CONFIRMED: "IMPORT_CONFIRMED",
  IMPORT_CANCELLED: "IMPORT_CANCELLED",
  IMPORT_DUPLICATE_SKIPS: "IMPORT_DUPLICATE_SKIPS",
  IMPORT_TRANSACTION_INSERTS: "IMPORT_TRANSACTION_INSERTS",
  IMPORT_MISMATCHES: "IMPORT_MISMATCHES",
  IMPORT_BALANCE_ISSUES: "IMPORT_BALANCE_ISSUES",
  ALLOCATION_LINK: "ALLOCATION_LINK",
  ALLOCATION_PARTIAL: "ALLOCATION_PARTIAL",
  ALLOCATION_REMOVE: "ALLOCATION_REMOVE",
  MANUAL_PAYMENT_CREATE: "MANUAL_PAYMENT_CREATE",
  MANUAL_PAYMENT_VERIFY: "MANUAL_PAYMENT_VERIFY",
  PI_CANCEL_RELEASE: "PI_CANCEL_RELEASE",
  RECONCILIATION_STATUS: "RECONCILIATION_STATUS",
} as const;

export type BankingAuditEventType =
  (typeof BANKING_AUDIT_EVENTS)[keyof typeof BANKING_AUDIT_EVENTS];

export const BANKING_AUDIT_REASONS: Record<BankingAuditEventType, string> = {
  IMPORT_STARTED: "Statement upload preview started",
  IMPORT_PREVIEW_READY: "Statement import analysis preview ready",
  IMPORT_FAILED: "Statement import preview failed",
  IMPORT_CONFIRMED: "Import safe transactions confirmed",
  IMPORT_CANCELLED: "Import preview cancelled",
  IMPORT_DUPLICATE_SKIPS: "Import duplicate skips",
  IMPORT_TRANSACTION_INSERTS: "Import transaction inserts",
  IMPORT_MISMATCHES: "Import mismatches recorded",
  IMPORT_BALANCE_ISSUES: "Import balance issues recorded",
  ALLOCATION_LINK: "Link bank payment",
  ALLOCATION_PARTIAL: "Partial bank payment allocation",
  ALLOCATION_REMOVE: "Remove Assignment",
  MANUAL_PAYMENT_CREATE: "Manual payment creation",
  MANUAL_PAYMENT_VERIFY: "Manual payment bank verification",
  PI_CANCEL_RELEASE: "PI Cancelled",
  RECONCILIATION_STATUS: "Reconciliation issue status change",
};

type BankingAuditInput = {
  eventType: BankingAuditEventType;
  tableName: string;
  recordId: string;
  action: AuditAction;
  performedBy?: string | null;
  companyId?: string | null;
  reference?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  /** Override default reason label when needed (still keeps eventType). */
  reason?: string | null;
};

function withEventType(
  eventType: BankingAuditEventType,
  newValue?: Prisma.InputJsonValue | null,
): Prisma.InputJsonValue {
  if (newValue && typeof newValue === "object" && !Array.isArray(newValue)) {
    return { eventType, ...(newValue as Record<string, unknown>) };
  }
  if (newValue === undefined || newValue === null) {
    return { eventType };
  }
  return { eventType, value: newValue };
}

export async function writeBankingAudit(input: BankingAuditInput) {
  return writeAuditLog({
    tableName: input.tableName,
    recordId: input.recordId,
    action: input.action,
    performedBy: input.performedBy,
    companyId: input.companyId,
    reference: input.reference,
    oldValue: input.oldValue,
    newValue: withEventType(input.eventType, input.newValue),
    reason: input.reason ?? BANKING_AUDIT_REASONS[input.eventType],
  });
}

export async function writeBankingAuditTx(
  tx: Prisma.TransactionClient,
  input: BankingAuditInput,
) {
  return writeAuditLogTx(tx, {
    tableName: input.tableName,
    recordId: input.recordId,
    action: input.action,
    performedBy: input.performedBy,
    companyId: input.companyId,
    reference: input.reference,
    oldValue: input.oldValue,
    newValue: withEventType(input.eventType, input.newValue),
    reason: input.reason ?? BANKING_AUDIT_REASONS[input.eventType],
  });
}

/** True when an audit payload (newValue or reason) matches a banking event type. */
export function auditMatchesBankingEvent(
  audit: { reason?: string | null; newValue?: unknown },
  eventType: BankingAuditEventType,
): boolean {
  if (audit.reason === BANKING_AUDIT_REASONS[eventType]) return true;
  if (
    audit.newValue &&
    typeof audit.newValue === "object" &&
    !Array.isArray(audit.newValue) &&
    (audit.newValue as { eventType?: string }).eventType === eventType
  ) {
    return true;
  }
  return false;
}
