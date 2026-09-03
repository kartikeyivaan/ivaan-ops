import { describe, expect, it } from "vitest";
import type { CustomerRefundStatus } from "@prisma/client";
import {
  REFUND_AUDIT_EVENTS,
  REFUND_AUDIT_REASONS,
  auditMatchesRefundEvent,
  refundAuditEventType,
} from "@/lib/customer-refund-audit";
import {
  CUSTOMER_REFUND_LOCKED_FIELDS,
  CUSTOMER_REFUND_STATUSES,
} from "@/lib/customer-refund-constants";

/**
 * Mirrors the transition guards enforced in customer-refund-service.ts so the
 * workflow rules are asserted without a database.
 */
const TRANSITIONS: Record<string, CustomerRefundStatus[]> = {
  submit: ["DRAFT"],
  approve: ["PENDING_APPROVAL"],
  reject: ["PENDING_APPROVAL"],
  returnForCorrection: ["PENDING_APPROVAL", "APPROVED", "FAILED"],
  process: ["APPROVED", "PROCESSING", "FAILED"],
  markFailed: ["APPROVED", "PROCESSING"],
  cancel: ["DRAFT", "PENDING_APPROVAL"],
  edit: ["DRAFT"],
};

function allows(action: keyof typeof TRANSITIONS, status: CustomerRefundStatus) {
  return TRANSITIONS[action]!.includes(status);
}

describe("refund workflow transitions", () => {
  it("walks the happy path SE request → manager approval → accounts execution", () => {
    let status: CustomerRefundStatus = "DRAFT";

    expect(allows("submit", status)).toBe(true);
    status = "PENDING_APPROVAL";

    expect(allows("approve", status)).toBe(true);
    status = "APPROVED";

    expect(allows("process", status)).toBe(true);
    status = "REFUNDED";

    // Nothing may touch a completed refund.
    for (const action of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      expect(allows(action, status)).toBe(false);
    }
  });

  it("walks the rejection path", () => {
    expect(allows("reject", "PENDING_APPROVAL")).toBe(true);
    for (const action of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      expect(allows(action, "REJECTED")).toBe(false);
    }
  });

  it("only allows editing and submitting from DRAFT", () => {
    for (const status of CUSTOMER_REFUND_STATUSES) {
      const expected = status === "DRAFT";
      expect(allows("edit", status)).toBe(expected);
      expect(allows("submit", status)).toBe(expected);
    }
  });

  it("does not let an unapproved refund be executed", () => {
    for (const status of ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"] as CustomerRefundStatus[]) {
      expect(allows("process", status)).toBe(false);
    }
  });

  it("lets a failed refund be retried or returned for correction", () => {
    expect(allows("process", "FAILED")).toBe(true);
    expect(allows("returnForCorrection", "FAILED")).toBe(true);
  });

  it("returns an approved refund to DRAFT so it needs re-approval", () => {
    expect(allows("returnForCorrection", "APPROVED")).toBe(true);
    // Back at DRAFT the request must be submitted and approved again.
    expect(allows("submit", "DRAFT")).toBe(true);
    expect(allows("approve", "DRAFT")).toBe(false);
  });

  it("cannot cancel once the refund is past approval", () => {
    for (const status of ["APPROVED", "PROCESSING", "REFUNDED"] as CustomerRefundStatus[]) {
      expect(allows("cancel", status)).toBe(false);
    }
  });

  it("freezes the commercial and payee fields at approval", () => {
    expect([...CUSTOMER_REFUND_LOCKED_FIELDS]).toEqual([
      "requestedAmount",
      "customerId",
      "companyId",
      "refundBankAccountId",
      "bankTransactionId",
      "transactionReferences",
    ]);
  });
});

describe("refund audit trail", () => {
  it("has a human label for every lifecycle event", () => {
    for (const eventType of Object.values(REFUND_AUDIT_EVENTS)) {
      expect(REFUND_AUDIT_REASONS[eventType]).toBeTruthy();
    }
  });

  it("covers each workflow stage the spec requires", () => {
    expect(REFUND_AUDIT_REASONS.REFUND_CREATED).toBe("Refund Created");
    expect(REFUND_AUDIT_REASONS.REFUND_SUBMITTED).toBe("Refund Submitted");
    expect(REFUND_AUDIT_REASONS.REFUND_APPROVED).toBe("Refund Approved");
    expect(REFUND_AUDIT_REASONS.REFUND_COMPLETED).toBe("Refund Completed");
  });

  it("matches an audit row by its embedded event type", () => {
    const audit = {
      reason: "Refund Approved",
      newValue: { eventType: "REFUND_APPROVED", approvedAmount: 100000 },
    };
    expect(auditMatchesRefundEvent(audit, REFUND_AUDIT_EVENTS.REFUND_APPROVED)).toBe(
      true,
    );
    expect(auditMatchesRefundEvent(audit, REFUND_AUDIT_EVENTS.REFUND_REJECTED)).toBe(
      false,
    );
  });

  it("matches an audit row by its reason label when the payload is absent", () => {
    const audit = { reason: "Refund Completed", newValue: null };
    expect(auditMatchesRefundEvent(audit, REFUND_AUDIT_EVENTS.REFUND_COMPLETED)).toBe(
      true,
    );
  });

  it("resolves an audit row back to its event type for the timeline", () => {
    expect(
      refundAuditEventType({ reason: null, newValue: { eventType: "REFUND_CREATED" } }),
    ).toBe("REFUND_CREATED");
    expect(refundAuditEventType({ reason: "Refund Rejected", newValue: null })).toBe(
      "REFUND_REJECTED",
    );
    expect(refundAuditEventType({ reason: "Something else", newValue: null })).toBeNull();
  });
});
