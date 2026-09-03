import type { PrismaClient } from "@prisma/client";
import type { Session } from "next-auth";
import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";
import { getSessionCompanyIds } from "@/lib/session";

/** Raise a refund request. */
const REQUEST_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_EXECUTIVE] as const;

/** Sales Manager decision stage. */
const APPROVE_ROLES = [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER] as const;

/** Accounts execution stage. */
const PROCESS_ROLES = [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS] as const;

/** Anyone who may open the module at all. */
const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.ACCOUNTS,
] as const;

/** See every refund, not just own requests. */
const VIEW_ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.ACCOUNTS,
] as const;

export function canAccessRefundsModule(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ROLES]);
}

export function canRequestRefund(userRoles: string[]): boolean {
  return hasRole(userRoles, [...REQUEST_ROLES]);
}

export function canViewAllRefunds(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ALL_ROLES]);
}

export function canApproveRefund(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_ROLES]);
}

/** Sales Manager may send an approved refund back for correction. */
export function canReturnRefundForCorrection(userRoles: string[]): boolean {
  return hasRole(userRoles, [...APPROVE_ROLES]);
}

export function canProcessRefund(userRoles: string[]): boolean {
  return hasRole(userRoles, [...PROCESS_ROLES]);
}

/** Verifying a payment code is part of raising a request. */
export function canVerifyRefundPayment(userRoles: string[]): boolean {
  return canRequestRefund(userRoles);
}

/**
 * Only the requester (or a Super Admin) may cancel, and only before execution.
 * Status is checked in the service; this is the role gate.
 */
export function canCancelRefund(
  userRoles: string[],
  requestedById: string,
  actorUserId: string,
): boolean {
  if (isSuperAdmin(userRoles)) return true;
  return canRequestRefund(userRoles) && requestedById === actorUserId;
}

/** Edit a draft request. Same rule as cancel. */
export function canEditRefundDraft(
  userRoles: string[],
  requestedById: string,
  actorUserId: string,
): boolean {
  if (isSuperAdmin(userRoles)) return true;
  return canRequestRefund(userRoles) && requestedById === actorUserId;
}

/**
 * Refunds are common to both firms. Super Admin sees every active company;
 * everyone else is limited to their assigned companies.
 */
export async function getAccessibleRefundCompanyIds(
  prisma: PrismaClient,
  session: Session,
): Promise<string[]> {
  if (isSuperAdmin(session.user?.roles ?? [])) {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return companies.map((company) => company.id);
  }
  return getSessionCompanyIds(session);
}

export function canAccessRefundCompany(
  allowedCompanyIds: string[],
  companyId: string,
): boolean {
  return allowedCompanyIds.includes(companyId);
}

export { isSuperAdmin };
