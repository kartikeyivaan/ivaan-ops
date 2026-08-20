import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

const DASHBOARD_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
] as const;

export function canViewSalesDashboard(userRoles: string[]): boolean {
  return hasRole(userRoles, [...DASHBOARD_ROLES]);
}

export function canViewTeamSalesDashboard(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles) || userRoles.includes(ROLES.SALES_MANAGER);
}

export function canViewExecutivePerformanceDetail(
  userRoles: string[],
  userId: string,
  targetExecutiveId: string,
): boolean {
  if (userId === targetExecutiveId) return true;
  return canViewTeamSalesDashboard(userRoles);
}

export function resolveRestrictToUserId(
  userRoles: string[],
  userId: string,
): string | null {
  if (canViewTeamSalesDashboard(userRoles)) return null;
  if (userRoles.includes(ROLES.SALES_EXECUTIVE)) return userId;
  return null;
}
