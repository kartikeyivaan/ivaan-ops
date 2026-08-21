import { describe, expect, it } from "vitest";
import {
  canAccessBankingAdmin,
  canAllocateBankPayments,
  canIgnoreReconciliationIssues,
  canManageBankAccounts,
  canManageReconciliation,
  canUploadBankStatements,
  canViewFullBankTransactions,
  canViewSalesCreditReceipts,
} from "@/lib/banking-permissions";
import { ROLES } from "@/lib/rbac";

describe("banking permissions", () => {
  it("gives Super Admin and Accounts full banking admin access", () => {
    for (const role of [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS]) {
      expect(canAccessBankingAdmin([role])).toBe(true);
      expect(canManageBankAccounts([role])).toBe(true);
      expect(canViewFullBankTransactions([role])).toBe(true);
      expect(canUploadBankStatements([role])).toBe(true);
      expect(canManageReconciliation([role])).toBe(true);
      expect(canIgnoreReconciliationIssues([role])).toBe(true);
    }
  });

  it("blocks Sales Executive from admin banking controls", () => {
    const roles = [ROLES.SALES_EXECUTIVE];
    expect(canAccessBankingAdmin(roles)).toBe(false);
    expect(canManageBankAccounts(roles)).toBe(false);
    expect(canViewFullBankTransactions(roles)).toBe(false);
    expect(canUploadBankStatements(roles)).toBe(false);
    expect(canManageReconciliation(roles)).toBe(false);
    expect(canIgnoreReconciliationIssues(roles)).toBe(false);
  });

  it("allows Sales Executive credit receipts and PI allocation", () => {
    const roles = [ROLES.SALES_EXECUTIVE];
    expect(canViewSalesCreditReceipts(roles)).toBe(true);
    expect(canAllocateBankPayments(roles)).toBe(true);
  });

  it("blocks unrelated roles from banking views", () => {
    const roles = [ROLES.WAREHOUSE, ROLES.PURCHASE, ROLES.SALES_MANAGER];
    for (const role of roles) {
      expect(canAccessBankingAdmin([role])).toBe(false);
      expect(canViewSalesCreditReceipts([role])).toBe(false);
      expect(canAllocateBankPayments([role])).toBe(false);
    }
  });
});
