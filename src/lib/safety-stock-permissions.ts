import { ROLES, hasRole } from "@/lib/rbac";

const SAFETY_STOCK_ROLES = [ROLES.SUPER_ADMIN, ROLES.PURCHASE, ROLES.SALES_MANAGER] as const;

export function canManageSafetyStock(roles: string[]) {
  return hasRole(roles, [...SAFETY_STOCK_ROLES]);
}
