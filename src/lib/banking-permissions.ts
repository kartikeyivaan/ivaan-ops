import { ROLES, hasRole } from "@/lib/rbac";

/** Full banking ops: accounts master, uploads, full ledger, reconciliation. */
const BANKING_ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS] as const;

/** Credit-receipt visibility + PI payment linking (no upload / debit / reconciliation controls). */
const BANKING_SALES_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ACCOUNTS,
  ROLES.SALES_EXECUTIVE,
] as const;

export function canAccessBankingAdmin(roles: string[]): boolean {
  return hasRole(roles, [...BANKING_ADMIN_ROLES]);
}

export function canManageBankAccounts(roles: string[]): boolean {
  return canAccessBankingAdmin(roles);
}

export function canViewFullBankTransactions(roles: string[]): boolean {
  return canAccessBankingAdmin(roles);
}

export function canUploadBankStatements(roles: string[]): boolean {
  return canAccessBankingAdmin(roles);
}

export function canManageReconciliation(roles: string[]): boolean {
  return canAccessBankingAdmin(roles);
}

export function canViewBankImportHistory(roles: string[]): boolean {
  return canAccessBankingAdmin(roles);
}

export function canViewSalesCreditReceipts(roles: string[]): boolean {
  return hasRole(roles, [...BANKING_SALES_ROLES]);
}

/** Link / allocate / match bank payments on PIs (Sales + Accounts). */
export function canAllocateBankPayments(roles: string[]): boolean {
  return hasRole(roles, [...BANKING_SALES_ROLES]);
}

export function canIgnoreReconciliationIssues(roles: string[]): boolean {
  return canAccessBankingAdmin(roles);
}
