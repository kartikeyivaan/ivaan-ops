import { ROLES, hasRole } from "@/lib/rbac";

const VIEW_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS, ROLES.DOCUMENTATION_EXECUTIVE] as const;
const MANAGE_ROLES = [ROLES.SUPER_ADMIN, ROLES.DOCUMENTATION_EXECUTIVE] as const;

export function canViewDocumentation(roles: string[]) {
  return hasRole(roles, [...VIEW_ROLES]);
}

export function canManageDocumentation(roles: string[]) {
  return hasRole(roles, [...MANAGE_ROLES]);
}

export function canAssignDocumentation(roles: string[]) {
  return roles.includes(ROLES.SUPER_ADMIN);
}
