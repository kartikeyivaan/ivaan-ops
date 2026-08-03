import type { PrismaClient } from "@prisma/client";
import type { Session } from "next-auth";
import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";
import { getSessionCompanyIds } from "@/lib/session";

const RAISE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PURCHASE,
  ROLES.WAREHOUSE,
  ROLES.SALES_MANAGER,
  ROLES.SALES_EXECUTIVE,
  ROLES.PROJECTS_MANAGER,
  ROLES.PROJECTS_SALES_EXECUTIVE,
] as const;

/** See every request across accessible companies (not only own). */
const VIEW_ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PURCHASE,
  ROLES.PROJECTS_MANAGER,
] as const;

/** Update purchase-request status (and create Incoming from a request line). */
const MANAGE_REQUEST_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PURCHASE,
  ROLES.PROJECTS_MANAGER,
] as const;

/** Incoming Material + Vendors module tabs (purchase ops). */
const MANAGE_OPS_ROLES = [ROLES.SUPER_ADMIN, ROLES.PURCHASE] as const;

export function canAccessPurchaseModule(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RAISE_ROLES]);
}

export function canRaisePurchaseRequest(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RAISE_ROLES]);
}

export function canViewAllPurchaseRequests(userRoles: string[]): boolean {
  return hasRole(userRoles, [...VIEW_ALL_ROLES]);
}

export function canManagePurchaseRequests(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_REQUEST_ROLES]);
}

export function canManagePurchaseOps(userRoles: string[]): boolean {
  return hasRole(userRoles, [...MANAGE_OPS_ROLES]);
}

export function canCreateProductForPurchaseRequest(userRoles: string[]): boolean {
  return hasRole(userRoles, [...RAISE_ROLES]);
}

/** Companies whose purchase requests the user may list/open (both companies for SA). */
export async function getAccessiblePurchaseCompanyIds(
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

export function canAccessPurchaseRequestCompany(
  allowedCompanyIds: string[],
  companyId: string,
): boolean {
  return allowedCompanyIds.includes(companyId);
}

export { isSuperAdmin };
