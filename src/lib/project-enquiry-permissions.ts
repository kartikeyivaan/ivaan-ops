import { ProjectEnquiryStatus } from "@prisma/client";
import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
] as const;

const MANAGE_ROLES = VIEW_ROLES;

export function canViewProjectEnquiries(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canManageProjectEnquiries(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canReassignProjectEnquiries(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles) || userRoles.includes(ROLES.PROJECTS_MANAGER);
}

export function canAccessProjectEnquiry(
  userRoles: string[],
  userId: string,
  salesUserId: string,
): boolean {
  if (isSuperAdmin(userRoles) || userRoles.includes(ROLES.PROJECTS_MANAGER)) {
    return true;
  }
  if (userRoles.includes(ROLES.PROJECTS_SALES_EXECUTIVE)) {
    return salesUserId === userId;
  }
  return false;
}

export function canEditProjectEnquiry(
  userRoles: string[],
  userId: string,
  enquiry: { salesUserId: string; status: ProjectEnquiryStatus },
): boolean {
  if (!canAccessProjectEnquiry(userRoles, userId, enquiry.salesUserId)) {
    return false;
  }
  return enquiry.status === ProjectEnquiryStatus.OPEN || enquiry.status === ProjectEnquiryStatus.PROPOSAL_SENT;
}

export function restrictProjectEnquirySalesUserId(
  userRoles: string[],
  userId: string,
  requestedSalesUserId?: string,
): string | undefined {
  if (isSuperAdmin(userRoles) || userRoles.includes(ROLES.PROJECTS_MANAGER)) {
    return requestedSalesUserId;
  }
  if (userRoles.includes(ROLES.PROJECTS_SALES_EXECUTIVE)) {
    return userId;
  }
  return requestedSalesUserId;
}
