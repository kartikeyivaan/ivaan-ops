import { ROLES, hasRole } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
  ROLES.SALES_MANAGER,
] as const;

const PERFORM_ROLES = [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE] as const;

const CREATE_ROLES = [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE] as const;

const RESET_APPROVE_ROLES = [ROLES.SUPER_ADMIN] as const;

export function canViewInventoryAudits(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canCreateInventoryAudits(userRoles: string[]): boolean {
  return hasRole(userRoles, [...CREATE_ROLES]);
}

export function canPerformInventoryAudits(userRoles: string[]): boolean {
  return hasRole(userRoles, [...PERFORM_ROLES]);
}

export function canResetOpeningStock(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RESET_APPROVE_ROLES]);
}

export function canApproveOpeningStock(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RESET_APPROVE_ROLES]);
}

/** Super Admin can see system qty during blind daily counts. */
export function canSeeBlindSystemQty(userRoles: string[]): boolean {
  return hasRole(userRoles, [ROLES.SUPER_ADMIN]);
}
