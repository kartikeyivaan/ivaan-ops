import { ProjectProposalStatus } from "@prisma/client";
import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
] as const;

const MANAGE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
] as const;

const APPROVE_ROLES = [ROLES.SUPER_ADMIN, ROLES.PROJECTS_MANAGER] as const;

export function canViewProjectProposals(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canManageProjectProposals(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_ROLES]);
}

export function canApproveProjectProposals(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_ROLES]);
}

export function isProjectsSalesExecutive(userRoles: string[]): boolean {
  return (
    userRoles.includes(ROLES.PROJECTS_SALES_EXECUTIVE) &&
    !userRoles.includes(ROLES.PROJECTS_MANAGER) &&
    !isSuperAdmin(userRoles)
  );
}

export function canAccessProjectProposal(
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

export function canEditProjectProposal(
  userRoles: string[],
  userId: string,
  proposal: { salesUserId: string; status: ProjectProposalStatus },
): boolean {
  if (!canAccessProjectProposal(userRoles, userId, proposal.salesUserId)) {
    return false;
  }

  if (isSuperAdmin(userRoles) || userRoles.includes(ROLES.PROJECTS_MANAGER)) {
    return (
      proposal.status === ProjectProposalStatus.DRAFT ||
      proposal.status === ProjectProposalStatus.REJECTED
    );
  }

  if (proposal.status === ProjectProposalStatus.PENDING_APPROVAL) {
    return false;
  }

  return (
    proposal.status === ProjectProposalStatus.DRAFT ||
    proposal.status === ProjectProposalStatus.REJECTED
  );
}

export function restrictProjectProposalSalesUserId(
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
