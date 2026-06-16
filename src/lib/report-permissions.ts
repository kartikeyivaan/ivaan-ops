import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

const SALES_EXECUTIVE_REPORT_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
] as const;

const PAYMENT_FOLLOWUP_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.ACCOUNTS,
] as const;

const PRODUCT_MOVEMENT_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
] as const;

const BOOKED_AVAILABLE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
] as const;

const DISPATCH_REPORT_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
  ROLES.ACCOUNTS,
] as const;

export function canViewSalesExecutiveReport(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SALES_EXECUTIVE_REPORT_ROLES]);
}

export function canViewPaymentFollowupReport(userRoles: string[]): boolean {
  return hasRole(userRoles, [...PAYMENT_FOLLOWUP_ROLES]);
}

export function canViewProductMovementReport(userRoles: string[]): boolean {
  return hasRole(userRoles, [...PRODUCT_MOVEMENT_ROLES]);
}

export function canViewBookedAvailableReport(userRoles: string[]): boolean {
  return hasRole(userRoles, [...BOOKED_AVAILABLE_ROLES]);
}

export function canViewDispatchReport(userRoles: string[]): boolean {
  return hasRole(userRoles, [...DISPATCH_REPORT_ROLES]);
}

export function canViewAnyReport(userRoles: string[]): boolean {
  return (
    canViewSalesExecutiveReport(userRoles) ||
    canViewPaymentFollowupReport(userRoles) ||
    canViewProductMovementReport(userRoles) ||
    canViewBookedAvailableReport(userRoles) ||
    canViewDispatchReport(userRoles)
  );
}

export function restrictSalesUserId(
  userRoles: string[],
  userId: string,
  requestedSalesUserId?: string,
): string | undefined {
  if (isSuperAdmin(userRoles) || userRoles.includes(ROLES.SALES_MANAGER)) {
    return requestedSalesUserId;
  }
  if (userRoles.includes(ROLES.SALES_EXECUTIVE)) {
    return userId;
  }
  return requestedSalesUserId;
}
