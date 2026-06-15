import { ROLES, hasRole } from "@/lib/rbac";

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
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
] as const;

const PRICING_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.PURCHASE,
] as const;

export function canViewProducts(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canEditProducts(userRoles: string[]): boolean {
  return hasRole(userRoles, [...EDIT_ROLES]);
}

export function canManageProductPricing(userRoles: string[]): boolean {
  return hasRole(userRoles, [...PRICING_ROLES]);
}
