import { ROLES, hasRole } from "@/lib/rbac";

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

const PAYMENT_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.ACCOUNTS,
] as const;

const APPROVE_BOOKING_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

const DISPATCH_TODAY_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
] as const;

const APPROVE_DISPATCH_TODAY_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

const APPROVE_CANCEL_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

export function canViewProformaInvoices(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canManageProformaInvoices(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canRecordPayments(userRoles: string[]): boolean {
  return hasRole(userRoles, [...PAYMENT_ROLES]);
}

export function canApproveBooking(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_BOOKING_ROLES]);
}

export function canMarkDispatchToday(userRoles: string[]): boolean {
  return hasRole(userRoles, [...DISPATCH_TODAY_ROLES]);
}

export function canApproveDispatchToday(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_DISPATCH_TODAY_ROLES]);
}

export function canRequestPiCancel(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canApprovePiCancel(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_CANCEL_ROLES]);
}
