import { ROLES, hasRole } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
  ROLES.ACCOUNTS,
] as const;

const MANAGE_ROLES = [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE] as const;

const SERIAL_VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
] as const;

const APPROVE_CANCEL_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

export function canViewDispatches(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canManageDispatches(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

/** Warehouse live DC or sales queued/historic DC — both need serial lookup. */
export function canLookupDispatchSerials(userRoles: string[]): boolean {
  return (
    canManageDispatches(userRoles) ||
    hasRole(userRoles, [
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
    ])
  );
}

export function canViewDispatchSerials(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERIAL_VIEW_ROLES]);
}

export function canApproveDispatchCancel(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_CANCEL_ROLES]);
}
