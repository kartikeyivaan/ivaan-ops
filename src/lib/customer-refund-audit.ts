import type { AuditAction, Prisma } from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";

export const CUSTOMER_REFUND_AUDIT_TABLE = "customer_refunds";

/**
 * Refund lifecycle events. Stored as `reason` (human label) and mirrored in
 * `newValue.eventType` so the detail-page timeline can filter reliably.
 * Mirrors the banking module's audit catalog (see banking-audit.ts).
 */
export const REFUND_AUDIT_EVENTS = {
  REFUND_CREATED: "REFUND_CREATED",
  REFUND_UPDATED: "REFUND_UPDATED",
  REFUND_SUBMITTED: "REFUND_SUBMITTED",
  REFUND_APPROVED: "REFUND_APPROVED",
  REFUND_REJECTED: "REFUND_REJECTED",
  REFUND_RETURNED_FOR_CORRECTION: "REFUND_RETURNED_FOR_CORRECTION",
  REFUND_PROCESSING_STARTED: "REFUND_PROCESSING_STARTED",
  REFUND_COMPLETED: "REFUND_COMPLETED",
  REFUND_FAILED: "REFUND_FAILED",
  REFUND_CANCELLED: "REFUND_CANCELLED",
  REFUND_BANK_ACCOUNT_ADDED: "REFUND_BANK_ACCOUNT_ADDED",
} as const;

export type RefundAuditEventType =
  (typeof REFUND_AUDIT_EVENTS)[keyof typeof REFUND_AUDIT_EVENTS];

export const REFUND_AUDIT_REASONS: Record<RefundAuditEventType, string> = {
  REFUND_CREATED: "Refund Created",
  REFUND_UPDATED: "Refund Updated",
  REFUND_SUBMITTED: "Refund Submitted",
  REFUND_APPROVED: "Refund Approved",
  REFUND_REJECTED: "Refund Rejected",
  REFUND_RETURNED_FOR_CORRECTION: "Refund Returned for Correction",
  REFUND_PROCESSING_STARTED: "Refund Processing Started",
  REFUND_COMPLETED: "Refund Completed",
  REFUND_FAILED: "Refund Failed",
  REFUND_CANCELLED: "Refund Cancelled",
  REFUND_BANK_ACCOUNT_ADDED: "New Refund Bank Account Added",
};

type RefundAuditInput = {
  eventType: RefundAuditEventType;
  recordId: string;
  action: AuditAction;
  /** Defaults to customer_refunds; override for the bank-account table. */
  tableName?: string;
  performedBy?: string | null;
  /** Actor's roles, so the timeline can show "by Sales Manager". */
  performedByRoles?: string[];
  companyId?: string | null;
  /** Refund number, so the audit log is readable without a join. */
  reference?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  remarks?: string | null;
  reason?: string | null;
};

function withEventType(input: RefundAuditInput): Prisma.InputJsonValue {
  const base: Prisma.InputJsonObject = {
    eventType: input.eventType,
    ...(input.performedByRoles?.length
      ? { performedByRoles: input.performedByRoles }
      : {}),
    ...(input.remarks ? { remarks: input.remarks } : {}),
  };

  const value = input.newValue;
  if (value === undefined || value === null) {
    return base;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...base, ...value };
  }
  return { ...base, value };
}

export async function writeRefundAuditTx(
  tx: Prisma.TransactionClient,
  input: RefundAuditInput,
) {
  return writeAuditLogTx(tx, {
    tableName: input.tableName ?? CUSTOMER_REFUND_AUDIT_TABLE,
    recordId: input.recordId,
    action: input.action,
    performedBy: input.performedBy,
    companyId: input.companyId,
    reference: input.reference,
    oldValue: input.oldValue,
    newValue: withEventType(input),
    reason: input.reason ?? REFUND_AUDIT_REASONS[input.eventType],
  });
}

/** True when an audit payload matches a refund event type. */
export function auditMatchesRefundEvent(
  audit: { reason?: string | null; newValue?: unknown },
  eventType: RefundAuditEventType,
): boolean {
  if (audit.reason === REFUND_AUDIT_REASONS[eventType]) return true;
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

/** Resolve an audit row back to its event type for timeline rendering. */
export function refundAuditEventType(audit: {
  reason?: string | null;
  newValue?: unknown;
}): RefundAuditEventType | null {
  const fromPayload =
    audit.newValue &&
    typeof audit.newValue === "object" &&
    !Array.isArray(audit.newValue)
      ? (audit.newValue as { eventType?: string }).eventType
      : undefined;
  if (fromPayload && fromPayload in REFUND_AUDIT_REASONS) {
    return fromPayload as RefundAuditEventType;
  }
  const entry = Object.entries(REFUND_AUDIT_REASONS).find(
    ([, label]) => label === audit.reason,
  );
  return entry ? (entry[0] as RefundAuditEventType) : null;
}
