import { describe, expect, it } from "vitest";
import {
  canAccessRefundCompany,
  canAccessRefundsModule,
  canApproveRefund,
  canCancelRefund,
  canEditRefundDraft,
  canProcessRefund,
  canRequestRefund,
  canReturnRefundForCorrection,
  canVerifyRefundPayment,
  canViewAllRefunds,
} from "@/lib/customer-refund-permissions";
import { ROLES } from "@/lib/rbac";

describe("customer refund permissions", () => {
  it("lets Sales Executives raise and verify refund requests", () => {
    const roles = [ROLES.SALES_EXECUTIVE];
    expect(canAccessRefundsModule(roles)).toBe(true);
    expect(canRequestRefund(roles)).toBe(true);
    expect(canVerifyRefundPayment(roles)).toBe(true);
  });

  it("blocks Sales Executives from approving, returning or executing refunds", () => {
    const roles = [ROLES.SALES_EXECUTIVE];
    expect(canApproveRefund(roles)).toBe(false);
    expect(canReturnRefundForCorrection(roles)).toBe(false);
    expect(canProcessRefund(roles)).toBe(false);
    expect(canViewAllRefunds(roles)).toBe(false);
  });

  it("lets Sales Managers approve, reject and return for correction but not execute", () => {
    const roles = [ROLES.SALES_MANAGER];
    expect(canAccessRefundsModule(roles)).toBe(true);
    expect(canApproveRefund(roles)).toBe(true);
    expect(canReturnRefundForCorrection(roles)).toBe(true);
    expect(canViewAllRefunds(roles)).toBe(true);
    expect(canProcessRefund(roles)).toBe(false);
    expect(canRequestRefund(roles)).toBe(false);
  });

  it("lets Accounts execute refunds but not approve them", () => {
    const roles = [ROLES.ACCOUNTS];
    expect(canAccessRefundsModule(roles)).toBe(true);
    expect(canProcessRefund(roles)).toBe(true);
    expect(canViewAllRefunds(roles)).toBe(true);
    expect(canApproveRefund(roles)).toBe(false);
    expect(canRequestRefund(roles)).toBe(false);
  });

  it("gives Super Admin full access to every refund stage", () => {
    const roles = [ROLES.SUPER_ADMIN];
    expect(canAccessRefundsModule(roles)).toBe(true);
    expect(canRequestRefund(roles)).toBe(true);
    expect(canApproveRefund(roles)).toBe(true);
    expect(canReturnRefundForCorrection(roles)).toBe(true);
    expect(canProcessRefund(roles)).toBe(true);
    expect(canViewAllRefunds(roles)).toBe(true);
  });

  it("keeps unrelated roles out of the module entirely", () => {
    for (const role of [
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.SERVICE_EXECUTIVE,
      ROLES.DOCUMENTATION_EXECUTIVE,
      ROLES.PROJECTS_MANAGER,
    ]) {
      expect(canAccessRefundsModule([role])).toBe(false);
      expect(canRequestRefund([role])).toBe(false);
      expect(canApproveRefund([role])).toBe(false);
      expect(canProcessRefund([role])).toBe(false);
    }
  });

  describe("ownership checks", () => {
    it("only lets the requester edit or cancel their own draft", () => {
      const roles = [ROLES.SALES_EXECUTIVE];
      expect(canEditRefundDraft(roles, "user-1", "user-1")).toBe(true);
      expect(canEditRefundDraft(roles, "user-1", "user-2")).toBe(false);
      expect(canCancelRefund(roles, "user-1", "user-1")).toBe(true);
      expect(canCancelRefund(roles, "user-1", "user-2")).toBe(false);
    });

    it("lets Super Admin edit or cancel anyone's request", () => {
      const roles = [ROLES.SUPER_ADMIN];
      expect(canEditRefundDraft(roles, "user-1", "user-2")).toBe(true);
      expect(canCancelRefund(roles, "user-1", "user-2")).toBe(true);
    });

    it("does not let a Sales Manager edit a Sales Executive's draft", () => {
      const roles = [ROLES.SALES_MANAGER];
      expect(canEditRefundDraft(roles, "user-1", "user-2")).toBe(false);
      expect(canCancelRefund(roles, "user-1", "user-2")).toBe(false);
    });
  });

  describe("firm scoping", () => {
    it("allows only firms the user can access", () => {
      const allowed = ["ise-id", "pcmv-id"];
      expect(canAccessRefundCompany(allowed, "ise-id")).toBe(true);
      expect(canAccessRefundCompany(allowed, "pcmv-id")).toBe(true);
      expect(canAccessRefundCompany(allowed, "other-id")).toBe(false);
    });

    it("blocks every firm when the user has none assigned", () => {
      expect(canAccessRefundCompany([], "ise-id")).toBe(false);
    });
  });
});
