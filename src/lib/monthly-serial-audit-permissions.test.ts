import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/rbac";
import {
  canManageMonthlyAudit,
  canScanMonthlyAudit,
  canViewMonthlyAudit,
  monthlyAuditErrorFor,
} from "@/lib/monthly-serial-audit-permissions";

describe("monthly audit permissions", () => {
  it("lets only Super Admin start, close, cancel, reopen, approve and export", () => {
    expect(canManageMonthlyAudit([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canManageMonthlyAudit([ROLES.WAREHOUSE])).toBe(false);
  });

  it("lets Super Admin and Warehouse scan and enter counts", () => {
    expect(canScanMonthlyAudit([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canScanMonthlyAudit([ROLES.WAREHOUSE])).toBe(true);
    expect(canScanMonthlyAudit([ROLES.PURCHASE])).toBe(false);
  });

  it("lets only the inventory audit viewing roles view runs", () => {
    expect(canViewMonthlyAudit([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canViewMonthlyAudit([ROLES.WAREHOUSE])).toBe(true);
    expect(canViewMonthlyAudit(["UNKNOWN_ROLE"])).toBe(false);
  });
});

describe("monthlyAuditErrorFor", () => {
  it("maps known service errors to their code and HTTP status", () => {
    expect(monthlyAuditErrorFor(new Error("AUDIT_NOT_OPEN"))).toEqual({
      code: "AUDIT_NOT_OPEN",
      message: "This audit is not open for scanning or counting.",
      status: 409,
    });
  });

  it("returns null for unknown errors so the caller falls back to 500", () => {
    expect(monthlyAuditErrorFor(new Error("SOMETHING_ELSE"))).toBeNull();
    expect(monthlyAuditErrorFor("not an error")).toBeNull();
  });
});
