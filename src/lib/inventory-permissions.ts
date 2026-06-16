import { ROLES, hasRole } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
  ROLES.ACCOUNTS,
] as const;

const INCOMING_ROLES = [ROLES.SUPER_ADMIN, ROLES.PURCHASE] as const;

const INWARD_ROLES = [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE] as const;

const DAMAGE_ROLES = [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE] as const;

const ADJUST_ROLES = [ROLES.SUPER_ADMIN] as const;

const SERIAL_VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
] as const;

export function canViewInventory(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canCreateIncoming(userRoles: string[]): boolean {
  return hasRole(userRoles, [...INCOMING_ROLES]);
}

export function canInwardMaterial(userRoles: string[]): boolean {
  return hasRole(userRoles, [...INWARD_ROLES]);
}

export function canReportDamage(userRoles: string[]): boolean {
  return hasRole(userRoles, [...DAMAGE_ROLES]);
}

export function canAdjustStock(userRoles: string[]): boolean {
  return hasRole(userRoles, [...ADJUST_ROLES]);
}

export function canViewSerialNumbers(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERIAL_VIEW_ROLES]);
}
