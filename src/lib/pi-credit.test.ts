import { describe, expect, it } from "vitest";
import {
  canRequestPiCreditOnStatus,
  computeCreditDueDate,
  creditDaysSinceApproval,
  hasApprovedPiCredit,
  isCreditOverdue,
  PI_CREDIT_DUE_DAYS,
  PI_CREDIT_REMINDER_START_DAY,
  shouldSendCreditReminder,
} from "@/lib/pi-credit";
import {
  canApprovePiCreditAccounts,
  canApprovePiCreditSm,
  canRequestPiCredit,
} from "@/lib/pi-permissions";
import { ROLES } from "@/lib/rbac";

describe("pi credit helpers", () => {
  it("uses a 7-day due window from approval", () => {
    expect(PI_CREDIT_DUE_DAYS).toBe(7);
    expect(computeCreditDueDate(new Date("2026-08-01T10:00:00.000Z")).toISOString().slice(0, 10)).toBe(
      "2026-08-08",
    );
  });

  it("allows credit request only with outstanding and resettable status", () => {
    expect(canRequestPiCreditOnStatus("BOOKED", "NONE", 1000)).toBe(true);
    expect(canRequestPiCreditOnStatus("ISSUED", "NONE", 1000)).toBe(true);
    expect(canRequestPiCreditOnStatus("BOOKED", "NONE", 0)).toBe(false);
    expect(canRequestPiCreditOnStatus("BOOKED", "PENDING_SM", 1000)).toBe(false);
    expect(canRequestPiCreditOnStatus("BOOKED", "APPROVED", 1000)).toBe(false);
    expect(canRequestPiCreditOnStatus("BOOKED", "REJECTED", 1000)).toBe(true);
    expect(canRequestPiCreditOnStatus("FULLY_DISPATCHED", "NONE", 1000)).toBe(false);
  });

  it("starts reminders from day 3 and skips same-day duplicates", () => {
    expect(PI_CREDIT_REMINDER_START_DAY).toBe(3);
    expect(creditDaysSinceApproval("2026-08-01", "2026-08-04")).toBe(3);
    expect(
      shouldSendCreditReminder({
        creditStatus: "APPROVED",
        outstanding: 1000,
        accountsApprovedAt: "2026-08-01",
        lastReminderOn: null,
        today: "2026-08-04",
      }),
    ).toBe(true);
    expect(
      shouldSendCreditReminder({
        creditStatus: "APPROVED",
        outstanding: 1000,
        accountsApprovedAt: "2026-08-01",
        lastReminderOn: "2026-08-04",
        today: "2026-08-04",
      }),
    ).toBe(false);
    expect(
      shouldSendCreditReminder({
        creditStatus: "APPROVED",
        outstanding: 1000,
        accountsApprovedAt: "2026-08-01",
        lastReminderOn: null,
        today: "2026-08-02",
      }),
    ).toBe(false);
  });

  it("detects overdue approved credit", () => {
    expect(hasApprovedPiCredit("APPROVED")).toBe(true);
    expect(
      isCreditOverdue({
        creditStatus: "APPROVED",
        outstanding: 1000,
        dueDate: "2026-08-01",
        today: "2026-08-02",
      }),
    ).toBe(true);
    expect(
      isCreditOverdue({
        creditStatus: "APPROVED",
        outstanding: 1000,
        dueDate: "2026-08-02",
        today: "2026-08-02",
      }),
    ).toBe(false);
  });

  it("gates request and sequential approvers by role", () => {
    expect(canRequestPiCredit([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canRequestPiCredit([ROLES.SALES_MANAGER])).toBe(false);
    expect(canApprovePiCreditSm([ROLES.SALES_MANAGER])).toBe(true);
    expect(canApprovePiCreditSm([ROLES.ACCOUNTS])).toBe(false);
    expect(canApprovePiCreditAccounts([ROLES.ACCOUNTS])).toBe(true);
    expect(canApprovePiCreditAccounts([ROLES.SALES_MANAGER])).toBe(false);
  });
});
