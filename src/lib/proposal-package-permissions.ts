import { isSuperAdmin } from "@/lib/rbac";

export function canManageProposalPackages(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles);
}
