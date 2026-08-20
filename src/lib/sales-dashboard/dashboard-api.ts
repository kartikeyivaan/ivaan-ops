import type { Session } from "next-auth";
import { requireActiveCompany } from "@/lib/session";
import {
  canViewSalesDashboard,
  canViewTeamSalesDashboard,
  resolveRestrictToUserId,
} from "@/lib/sales-dashboard/dashboard-permissions";
import type { SalesDashboardScope } from "@/lib/sales-dashboard/dashboard-types";

export class SalesDashboardAccessError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "VALIDATION_ERROR" = "FORBIDDEN",
  ) {
    super(message);
  }
}

export function resolveSalesDashboardScope(session: Session): SalesDashboardScope {
  if (!canViewSalesDashboard(session.user.roles)) {
    throw new SalesDashboardAccessError("You do not have permission for the sales dashboard.");
  }

  const companyId = requireActiveCompany(session);
  const restrictToUserId = resolveRestrictToUserId(session.user.roles, session.user.id);

  return {
    companyId,
    restrictToUserId,
    canViewTeam: canViewTeamSalesDashboard(session.user.roles),
    userId: session.user.id,
    roles: session.user.roles,
  };
}

export function resolveTargetExecutiveId(
  scope: SalesDashboardScope,
  requestedExecutiveId?: string,
): string | undefined {
  if (scope.restrictToUserId) return scope.restrictToUserId;
  return requestedExecutiveId;
}
