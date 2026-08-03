import { ROLES, hasRole } from "@/lib/rbac";

const RAISE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PURCHASE,
  ROLES.WAREHOUSE,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
] as const;

const MANAGE_ROLES = [ROLES.SUPER_ADMIN, ROLES.PURCHASE] as const;

export function canAccessPurchaseModule(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RAISE_ROLES]);
}

export function canRaisePurchaseRequest(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RAISE_ROLES]);
}

export function canViewAllPurchaseRequests(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canManagePurchaseRequests(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canCreateProductForPurchaseRequest(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RAISE_ROLES]);
}
