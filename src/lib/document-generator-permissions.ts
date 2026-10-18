import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ACCOUNTS,
  ROLES.DOCUMENTATION_EXECUTIVE,
] as const;

const GENERATE_ROLES = [...VIEW_ROLES] as const;

/** Template, field, and set administration — Super Admin only. */
export function canAdminDocumentGenerator(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles);
}

export function canViewDocumentGenerator(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canGenerateDocuments(userRoles: string[]): boolean {
  return hasRole(userRoles, [...GENERATE_ROLES]);
}
