import { MonthlyAuditStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  assertMonthlyAuditAllowsMovement,
  nextMonthlyAuditStatus,
} from "@/lib/monthly-serial-audit-service";

const { OPEN, CLOSED, APPROVED, CANCELLED } = MonthlyAuditStatus;

describe("nextMonthlyAuditStatus", () => {
  it("closes only an OPEN run", () => {
    expect(nextMonthlyAuditStatus(OPEN, "close")).toBe(CLOSED);
    expect(() => nextMonthlyAuditStatus(CLOSED, "close")).toThrow("INVALID_TRANSITION");
    expect(() => nextMonthlyAuditStatus(APPROVED, "close")).toThrow("INVALID_TRANSITION");
  });

  it("cancels an OPEN or CLOSED run, never an approved one", () => {
    expect(nextMonthlyAuditStatus(OPEN, "cancel")).toBe(CANCELLED);
    expect(nextMonthlyAuditStatus(CLOSED, "cancel")).toBe(CANCELLED);
    expect(() => nextMonthlyAuditStatus(APPROVED, "cancel")).toThrow("INVALID_TRANSITION");
    expect(() => nextMonthlyAuditStatus(CANCELLED, "cancel")).toThrow("INVALID_TRANSITION");
  });

  it("reopens only a CLOSED run", () => {
    expect(nextMonthlyAuditStatus(CLOSED, "reopen")).toBe(OPEN);
    expect(() => nextMonthlyAuditStatus(OPEN, "reopen")).toThrow("INVALID_TRANSITION");
    expect(() => nextMonthlyAuditStatus(CANCELLED, "reopen")).toThrow("INVALID_TRANSITION");
  });

  it("approves only a CLOSED run", () => {
    expect(nextMonthlyAuditStatus(CLOSED, "approve")).toBe(APPROVED);
    expect(() => nextMonthlyAuditStatus(OPEN, "approve")).toThrow("INVALID_TRANSITION");
  });
});

describe("assertMonthlyAuditAllowsMovement (freeze)", () => {
  function fakePrisma(openRun: boolean) {
    return {
      inventoryMonthlyAudit: {
        findFirst: async () => (openRun ? { id: "run-1" } : null),
      },
    } as never;
  }

  it("blocks incoming, transfer and adjust while a run is OPEN", async () => {
    await expect(assertMonthlyAuditAllowsMovement(fakePrisma(true))).rejects.toThrow(
      "INVENTORY_OPS_BLOCKED",
    );
  });

  it("allows movements when no run is OPEN (including after CLOSED, before approval)", async () => {
    await expect(assertMonthlyAuditAllowsMovement(fakePrisma(false))).resolves.toBeUndefined();
  });
});
