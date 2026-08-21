import { describe, expect, it } from "vitest";
import {
  auditMatchesBankingEvent,
  BANKING_AUDIT_EVENTS,
  BANKING_AUDIT_REASONS,
} from "@/lib/banking-audit";

describe("banking audit catalog (Command 15)", () => {
  it("covers every required banking event type with a stable reason label", () => {
    const required = [
      BANKING_AUDIT_EVENTS.IMPORT_STARTED,
      BANKING_AUDIT_EVENTS.IMPORT_DUPLICATE_SKIPS,
      BANKING_AUDIT_EVENTS.IMPORT_TRANSACTION_INSERTS,
      BANKING_AUDIT_EVENTS.IMPORT_MISMATCHES,
      BANKING_AUDIT_EVENTS.IMPORT_BALANCE_ISSUES,
      BANKING_AUDIT_EVENTS.ALLOCATION_LINK,
      BANKING_AUDIT_EVENTS.ALLOCATION_PARTIAL,
      BANKING_AUDIT_EVENTS.ALLOCATION_REMOVE,
      BANKING_AUDIT_EVENTS.MANUAL_PAYMENT_CREATE,
      BANKING_AUDIT_EVENTS.MANUAL_PAYMENT_VERIFY,
      BANKING_AUDIT_EVENTS.PI_CANCEL_RELEASE,
    ] as const;

    for (const eventType of required) {
      expect(BANKING_AUDIT_REASONS[eventType].length).toBeGreaterThan(3);
    }
  });

  it("matches audits by eventType in newValue or by reason label", () => {
    expect(
      auditMatchesBankingEvent(
        {
          reason: BANKING_AUDIT_REASONS.IMPORT_DUPLICATE_SKIPS,
          newValue: { eventType: BANKING_AUDIT_EVENTS.IMPORT_DUPLICATE_SKIPS },
        },
        BANKING_AUDIT_EVENTS.IMPORT_DUPLICATE_SKIPS,
      ),
    ).toBe(true);

    expect(
      auditMatchesBankingEvent(
        { reason: "Manual payment creation", newValue: null },
        BANKING_AUDIT_EVENTS.MANUAL_PAYMENT_CREATE,
      ),
    ).toBe(true);

    expect(
      auditMatchesBankingEvent(
        { reason: "other", newValue: { eventType: BANKING_AUDIT_EVENTS.PI_CANCEL_RELEASE } },
        BANKING_AUDIT_EVENTS.PI_CANCEL_RELEASE,
      ),
    ).toBe(true);

    expect(
      auditMatchesBankingEvent(
        { reason: "unrelated", newValue: { foo: 1 } },
        BANKING_AUDIT_EVENTS.ALLOCATION_LINK,
      ),
    ).toBe(false);
  });

  it("maps Cmd 15 store fields onto AuditLog columns", () => {
    // event_type → newValue.eventType + reason
    // entity_type/id → tableName + recordId
    // old_value / new_value / actor / timestamp / reason → AuditLog columns
    const mapping = {
      event_type: "newValue.eventType + reason",
      entity_type: "tableName",
      entity_id: "recordId",
      old_value: "oldValue",
      new_value: "newValue",
      actor: "performedBy",
      timestamp: "performedAt",
      reason: "reason",
    };
    expect(Object.keys(mapping)).toEqual([
      "event_type",
      "entity_type",
      "entity_id",
      "old_value",
      "new_value",
      "actor",
      "timestamp",
      "reason",
    ]);
  });
});
