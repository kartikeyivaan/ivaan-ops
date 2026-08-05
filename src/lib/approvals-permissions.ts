import { canApproveDispatchCancel } from "@/lib/dispatch-permissions";
import { canApproveOpeningStock } from "@/lib/inventory-audit-permissions";
import {
  canApproveIncomingLotEdit,
  canApprovePanelDamage,
} from "@/lib/inventory-permissions";
import {
  canApproveBooking,
  canApproveDispatchToday,
  canApprovePiCancel,
} from "@/lib/pi-permissions";
import { canApproveProjectProposals } from "@/lib/project-proposal-permissions";
import { canApproveQuotationPricing } from "@/lib/quotation-permissions";
import { ROLES, type RoleName } from "@/lib/rbac";

/** Roles that can approve at least one workflow. */
export const APPROVALS_INBOX_ROLES: RoleName[] = [
  ROLES.SUPER_ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.PROJECTS_MANAGER,
  ROLES.PURCHASE,
];

export function canAccessApprovalsInbox(userRoles: string[]): boolean {
  return (
    canApproveQuotationPricing(userRoles) ||
    canApproveBooking(userRoles) ||
    canApproveDispatchToday(userRoles) ||
    canApproveDispatchCancel(userRoles) ||
    canApprovePiCancel(userRoles) ||
    canApproveProjectProposals(userRoles) ||
    canApproveOpeningStock(userRoles) ||
    canApprovePanelDamage(userRoles) ||
    canApproveIncomingLotEdit(userRoles)
  );
}
