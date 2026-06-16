import { ROLES, hasRole } from "@/lib/rbac";

const VIEW_ROLES = [ROLES.SUPER_ADMIN, ROLES.PURCHASE] as const;
const MANAGE_ROLES = [ROLES.SUPER_ADMIN, ROLES.PURCHASE] as const;

export function canViewVendors(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canManageVendors(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}
