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

/** Same roles as mark — sales can withdraw a pending or active dispatch-today request. */
export function canRecallDispatchToday(userRoles: string[]): boolean {
  return canMarkDispatchToday(userRoles);
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

const REQUEST_CREDIT_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_EXECUTIVE] as const;

const APPROVE_CREDIT_SM_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

const APPROVE_CREDIT_ACCOUNTS_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS] as const;

export function canRequestPiCredit(userRoles: string[]): boolean {
  return hasRole(userRoles, [...REQUEST_CREDIT_ROLES]);
}

export function canApprovePiCreditSm(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_CREDIT_SM_ROLES]);
}

export function canApprovePiCreditAccounts(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_CREDIT_ACCOUNTS_ROLES]);
}

/** True if the user can act on either credit approval stage. */
export function canApprovePiCredit(userRoles: string[]): boolean {
  return canApprovePiCreditSm(userRoles) || canApprovePiCreditAccounts(userRoles);
}
