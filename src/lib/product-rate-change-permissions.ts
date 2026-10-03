import { ROLES, hasRole } from "@/lib/rbac";

const CREATE_ROLES = [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER] as const;

const APPROVE_ROLES = [ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN] as const;

const VIEW_ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ...APPROVE_ROLES,
] as const;

export const PRODUCT_RATE_CHANGE_REQUIRED_APPROVALS = 2;

export function canCreateProductRateChange(userRoles: string[]): boolean {
  return hasRole(userRoles, [...CREATE_ROLES]);
}

export function canApproveProductRateChange(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_ROLES]);
}

export function canViewAllProductRateChanges(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ALL_ROLES]);
}

export function canViewProductRateChange(
  userRoles: string[],
  createdById: string,
  viewerId: string,
): boolean {
  if (canApproveProductRateChange(userRoles)) return true;
  if (canViewAllProductRateChanges(userRoles)) return true;
  if (canCreateProductRateChange(userRoles) && createdById === viewerId) return true;
  return false;
}
