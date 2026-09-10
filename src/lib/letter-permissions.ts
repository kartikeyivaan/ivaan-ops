import { isSuperAdmin } from "@/lib/rbac";

export function canManageOfficialLetters(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles);
}
