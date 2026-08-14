import { isPcmCompany, type WarningCompany } from "@/lib/quotation-warnings";
import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
  ROLES.ACCOUNTS,
] as const;

const MANAGE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
] as const;

const APPROVE_PRICE_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

export function canViewQuotations(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canManageQuotations(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

/** PCM quotations may only be created, revised or sent by Super Admin. */
export function canManageQuotationsForCompany(
  userRoles: string[],
  company: WarningCompany,
): boolean {
  if (!canManageQuotations(userRoles)) return false;
  if (isPcmCompany(company)) return isSuperAdmin(userRoles);
  return true;
}

export function canApproveQuotationPricing(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_PRICE_ROLES]);
}
