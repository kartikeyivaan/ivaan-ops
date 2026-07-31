import { ROLES, hasRole } from "@/lib/rbac";

const ACCOUNT_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS] as const;

export function canManageInvoiceQueue(roles: string[]) {
  return hasRole(roles, [...ACCOUNT_ROLES]);
}

export function canViewPiPayments(roles: string[]) {
  return hasRole(roles, [...ACCOUNT_ROLES]);
}
