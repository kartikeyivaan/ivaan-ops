import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
  ROLES.ACCOUNTS,
] as const;

const EDIT_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
] as const;

const REASSIGN_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

const INCENTIVE_CREDIT_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

export function canViewCustomers(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canEditCustomers(userRoles: string[]): boolean {
  return hasRole(userRoles, [...EDIT_ROLES]);
}

export function canEditIncentiveCredit(userRoles: string[]): boolean {
  return hasRole(userRoles, [...INCENTIVE_CREDIT_ROLES]);
}

export function canReassignCustomers(userRoles: string[]): boolean {
  return hasRole(userRoles, [...REASSIGN_ROLES]);
}

export function canImportCustomers(userRoles: string[]): boolean {
  return canEditCustomers(userRoles);
}

export function assertCompanyAccess(
  userRoles: string[],
  userCompanyIds: string[],
  companyId: string,
): boolean {
  if (isSuperAdmin(userRoles)) {
    return true;
  }
  return userCompanyIds.includes(companyId);
}
