import { ProjectStatus } from "@prisma/client";
import { ROLES, hasRole } from "@/lib/rbac";

const VIEW_ROLES = [ROLES.SUPER_ADMIN, ROLES.PROJECTS_MANAGER] as const;

const MANAGE_MATERIAL_ROLES = [ROLES.SUPER_ADMIN, ROLES.PROJECTS_MANAGER] as const;

const CONVERT_ROLES = [ROLES.SUPER_ADMIN, ROLES.PROJECTS_MANAGER] as const;

export function canViewExecutionProjects(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canEditProjectMaterial(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_MATERIAL_ROLES]);
}

export function canConvertProjectProposal(userRoles: string[]): boolean {
  return hasRole(userRoles, [...CONVERT_ROLES]);
}

export function canEditProjectMaterialForStatus(
  userRoles: string[],
  status: ProjectStatus,
): boolean {
  if (!canEditProjectMaterial(userRoles)) return false;
  return status !== ProjectStatus.CLOSED;
}

export function isProjectReadOnly(status: ProjectStatus): boolean {
  return status === ProjectStatus.CLOSED;
}

const VIEW_DISPATCH_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PROJECTS_MANAGER,
] as const;

const MANAGE_DISPATCH_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PROJECTS_MANAGER,
] as const;

const DISPATCH_SERIAL_ROLES = [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE] as const;

export function canViewProjectDispatches(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_DISPATCH_ROLES]);
}

export function canManageProjectDispatches(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_DISPATCH_ROLES]);
}

export function canViewProjectDispatchSerials(userRoles: string[]): boolean {
  return hasRole(userRoles, [...DISPATCH_SERIAL_ROLES]);
}

const CLOSE_PROJECT_ROLES = [ROLES.SUPER_ADMIN, ROLES.PROJECTS_MANAGER] as const;

const RETURN_STOCK_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PROJECTS_MANAGER,
] as const;

const VIEW_LINKED_PR_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PROJECTS_MANAGER,
  ROLES.PURCHASE,
] as const;

export function canCloseProject(userRoles: string[]): boolean {
  return hasRole(userRoles, [...CLOSE_PROJECT_ROLES]);
}

export function canReturnProjectStock(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RETURN_STOCK_ROLES]);
}

export function canViewLinkedPurchaseRequests(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_LINKED_PR_ROLES]);
}
