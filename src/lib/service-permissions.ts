import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

/**
 * Role-based capabilities for the Service module.
 *
 * The application uses role-based access control (there is no permission table),
 * so each `service.*` capability from the PRD is expressed as a `can*` function.
 * These names map 1:1 to the PRD permission list:
 *
 *   service.view            -> canViewService
 *   service.view_all        -> canViewAllService
 *   service.create          -> canCreateService
 *   service.edit            -> canEditService
 *   service.assign          -> canAssignService
 *   service.update_status   -> canUpdateServiceStatus
 *   service.add_update      -> canAddServiceUpdate
 *   service.complete        -> canCompleteService
 *   service.close           -> canCloseService
 *   service.reopen          -> canReopenService
 *   service.record_payment  -> canRecordServicePayment
 *   service.manage_work_types -> canManageServiceWorkTypes
 *   service.export          -> canExportService
 */

/** Roles that administer the Service module (assign, close, reopen, work types, export). */
const SERVICE_ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PROJECTS_MANAGER] as const;

/** Roles that see every service request, not just their own assignments. */
const SERVICE_VIEW_ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
] as const;

/** All roles that operate the Service module day to day. */
const SERVICE_STAFF_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
  ROLES.SERVICE_EXECUTIVE,
] as const;

export function isServiceExecutive(userRoles: string[]): boolean {
  return userRoles.includes(ROLES.SERVICE_EXECUTIVE);
}

export function canViewService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_STAFF_ROLES]);
}

export function canViewAllService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_VIEW_ALL_ROLES]);
}

export function canCreateService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_STAFF_ROLES]);
}

export function canEditService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_STAFF_ROLES]);
}

export function canAssignService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_ADMIN_ROLES]);
}

export function canUpdateServiceStatus(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_STAFF_ROLES]);
}

export function canAddServiceUpdate(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_STAFF_ROLES]);
}

export function canCompleteService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_STAFF_ROLES]);
}

export function canCloseService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_ADMIN_ROLES]);
}

export function canReopenService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_ADMIN_ROLES]);
}

export function canRecordServicePayment(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_STAFF_ROLES]);
}

export function canManageServiceWorkTypes(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_ADMIN_ROLES]);
}

export function canExportService(userRoles: string[]): boolean {
  return hasRole(userRoles, [...SERVICE_ADMIN_ROLES]);
}

/**
 * Whether a user's service list must be limited to requests assigned to them.
 * Returns true for users who lack the view-all capability (e.g. Service Executive).
 */
export function restrictServiceToAssigned(userRoles: string[]): boolean {
  return !canViewAllService(userRoles);
}

/** Roles allowed to appear in the "Assign To" picker for service requests. */
export const SERVICE_ASSIGNABLE_ROLES = [
  ROLES.SERVICE_EXECUTIVE,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
] as const;

export { isSuperAdmin };
