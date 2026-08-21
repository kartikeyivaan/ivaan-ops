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

const RESERVED_QTY_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
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

export function canViewReservedQtyReport(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RESERVED_QTY_ROLES]);
}

export function canViewDispatchReport(userRoles: string[]): boolean {
  return hasRole(userRoles, [...DISPATCH_REPORT_ROLES]);
}

export function canViewSalesPerformanceReport(userRoles: string[]): boolean {
  return canViewSalesExecutiveReport(userRoles);
}

export function canViewSalesFunnelReport(userRoles: string[]): boolean {
  return canViewSalesExecutiveReport(userRoles);
}

export function canViewCollectionReport(userRoles: string[]): boolean {
  return canViewPaymentFollowupReport(userRoles);
}

export function canViewExecutivePerformanceReport(userRoles: string[]): boolean {
  return canViewSalesExecutiveReport(userRoles);
}

export function canViewAnyReport(userRoles: string[]): boolean {
  return (
    canViewSalesExecutiveReport(userRoles) ||
    canViewPaymentFollowupReport(userRoles) ||
    canViewProductMovementReport(userRoles) ||
    canViewBookedAvailableReport(userRoles) ||
    canViewReservedQtyReport(userRoles) ||
    canViewDispatchReport(userRoles) ||
    canViewSalesPerformanceReport(userRoles) ||
    canViewSalesFunnelReport(userRoles) ||
    canViewCollectionReport(userRoles) ||
    canViewExecutivePerformanceReport(userRoles)
  );
}

/** Query/filter sentinel: list all company sales records (no salesUserId filter). */
export const FIRM_SALES_SCOPE = "all" as const;

export function isFirmSalesScope(
  value: string | undefined | null,
): value is typeof FIRM_SALES_SCOPE {
  return value === FIRM_SALES_SCOPE;
}

/**
 * Resolves list/report salesUserId scoping.
 * - Managers / Super Admin: honour requested id; `"all"` / empty → firm-wide.
 * - Sales Executive: defaults to self; explicit `"all"` opts into firm-wide (cover colleagues).
 * - Create flows must pass a concrete user id (never `"all"`).
 */
export function restrictSalesUserId(
  userRoles: string[],
  userId: string,
  requestedSalesUserId?: string,
): string | undefined {
  if (isSuperAdmin(userRoles) || userRoles.includes(ROLES.SALES_MANAGER)) {
    return isFirmSalesScope(requestedSalesUserId) ? undefined : requestedSalesUserId;
  }
  if (userRoles.includes(ROLES.SALES_EXECUTIVE)) {
    if (isFirmSalesScope(requestedSalesUserId)) {
      return undefined;
    }
    return userId;
  }
  return isFirmSalesScope(requestedSalesUserId) ? undefined : requestedSalesUserId;
}

/**
 * Soft UX default for list filters only. Access control must use
 * `restrictSalesUserId`. Executives default to self unless they pass `"all"`.
 * @deprecated Prefer `restrictSalesUserId` for authorization.
 */
export function defaultSalesListFilterUserId(
  userRoles: string[],
  userId: string,
): string | undefined {
  return restrictSalesUserId(userRoles, userId, undefined);
}
