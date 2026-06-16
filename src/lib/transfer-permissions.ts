import { ROLES, hasRole } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
  ROLES.ACCOUNTS,
] as const;

const MANAGE_ROLES = [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE] as const;

const SERIAL_VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
] as const;

export function canViewTransfers(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canCreateTransfer(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canDispatchTransfer(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canReceiveTransfer(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canCancelTransfer(userRoles: string[]): boolean {
  return hasRole(userRoles, [ROLES.SUPER_ADMIN]);
}

export function canViewTransferSerials(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERIAL_VIEW_ROLES]);
}
