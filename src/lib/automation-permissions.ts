import { canManageDocumentation, canViewDocumentation } from "@/lib/documentation-permissions";

export function canViewAutomation(roles: string[]) {
  return canViewDocumentation(roles);
}

export function canRunAutomation(roles: string[]) {
  return canManageDocumentation(roles);
}
