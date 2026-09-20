import type { PrismaClient } from "@prisma/client";
import { canAccessApprovalsInbox } from "@/lib/approvals-permissions";
import { countPendingApprovalsForUser } from "@/lib/approvals-service";
import { countTodaysDispatches } from "@/lib/dispatch-service";
import { countBookedOrders, countPendingPayments } from "@/lib/pi-service";
import { countOpenQuotations } from "@/lib/quotation-service";
import { ROLES } from "@/lib/rbac";
import { countPendingIncomingTransfers } from "@/lib/transfer-service";
import type {
  LegacyDashboardDto,
  LegacyDashboardScope,
} from "@/lib/sales-dashboard/dashboard-types";

function widgetValue(widget: string, counts: Record<string, number | null>): string {
  if (widget === "Transfer Requests" && counts.pendingTransfers !== null) {
    return String(counts.pendingTransfers);
  }
  if (widget === "Open Quotations" && counts.openQuotations !== null) {
    return String(counts.openQuotations);
  }
  if (widget === "Pending Approvals" && counts.pendingApprovals !== null) {
    return String(counts.pendingApprovals);
  }
  if (widget === "Booked Orders" && counts.bookedOrders !== null) {
    return String(counts.bookedOrders);
  }
  if (widget === "Pending Payments" && counts.pendingPayments !== null) {
    return String(counts.pendingPayments);
  }
  if (widget === "Today's Dispatches" && counts.todaysDispatches !== null) {
    return String(counts.todaysDispatches);
  }
  return "—";
}

function widgetDescription(widget: string, counts: Record<string, number | null>): string {
  if (widget === "Transfer Requests" && counts.pendingTransfers !== null) {
    return "Incoming transfers awaiting receipt";
  }
  if (widget === "Open Quotations" && counts.openQuotations !== null) {
    return "Sent quotations still within validity";
  }
  if (widget === "Pending Approvals" && counts.pendingApprovals !== null) {
    return "Items awaiting your approval — click to review";
  }
  if (widget === "Booked Orders" && counts.bookedOrders !== null) {
    return "Orders with approved booking and reserved stock";
  }
  if (widget === "Pending Payments" && counts.pendingPayments !== null) {
    return "Issued PIs with outstanding balance";
  }
  if (widget === "Today's Dispatches" && counts.todaysDispatches !== null) {
    return "Delivery challans dispatched today";
  }
  return "Placeholder for Sprint 1 module data";
}

function widgetHref(widget: string): string | null {
  if (widget === "Pending Approvals") return "/approvals";
  return null;
}

function widgetsForRoles(roles: string[]): string[] {
  if (roles.includes(ROLES.SUPER_ADMIN)) {
    return [
      "Sales by Executive",
      "This Month Sales Value",
      "Pending Approvals",
      "Inventory Value",
      "Pending Payments",
    ];
  }
  if (roles.includes(ROLES.SALES_MANAGER)) {
    return ["Open Quotations", "Booked Orders", "Order Value This Month", "Pending Approvals"];
  }
  if (roles.includes(ROLES.PROJECTS_MANAGER)) {
    return ["Pending Approvals"];
  }
  if (roles.includes(ROLES.WAREHOUSE)) {
    return ["Today's Dispatches", "Pending Inwarding", "Low Stock", "Transfer Requests"];
  }
  return ["Role-based dashboard"];
}

export async function getLegacyDashboard(
  prisma: PrismaClient,
  scope: LegacyDashboardScope,
): Promise<LegacyDashboardDto> {
  const roles = scope.roles;
  let pendingTransfers: number | null = null;
  let openQuotations: number | null = null;
  let pendingApprovals: number | null = null;
  let bookedOrders: number | null = null;
  let pendingPayments: number | null = null;
  let todaysDispatches: number | null = null;

  const countCompanyId = scope.allCompanies
    ? scope.companyIds[0]
    : scope.activeCompanyId;

  if (scope.activeCompanyId && countCompanyId) {
    try {
      const isWarehouse = roles.includes(ROLES.WAREHOUSE);
      const isSalesish =
        roles.includes(ROLES.SALES_EXECUTIVE) ||
        roles.includes(ROLES.SALES_MANAGER) ||
        roles.includes(ROLES.SUPER_ADMIN);
      const canSeeApprovals = canAccessApprovalsInbox(roles);
      const isAccountsish =
        roles.includes(ROLES.SUPER_ADMIN) || roles.includes(ROLES.ACCOUNTS);

      const [
        pendingTransfersResult,
        todaysDispatchesResult,
        openQuotationsResult,
        pendingApprovalsResult,
        bookedOrdersResult,
        pendingPaymentsResult,
      ] = await Promise.all([
        isWarehouse ? countPendingIncomingTransfers(prisma, countCompanyId) : Promise.resolve(null),
        isWarehouse ? countTodaysDispatches(prisma, countCompanyId) : Promise.resolve(null),
        isSalesish
          ? countOpenQuotations(
              prisma,
              countCompanyId,
              roles.includes(ROLES.SALES_EXECUTIVE) ? scope.userId : undefined,
            )
          : Promise.resolve(null),
        canSeeApprovals
          ? countPendingApprovalsForUser(prisma, scope.companyIds, roles)
          : Promise.resolve(null),
        isSalesish ? countBookedOrders(prisma, countCompanyId) : Promise.resolve(null),
        isAccountsish ? countPendingPayments(prisma, countCompanyId) : Promise.resolve(null),
      ]);

      pendingTransfers = pendingTransfersResult;
      todaysDispatches = todaysDispatchesResult;
      openQuotations = openQuotationsResult;
      pendingApprovals = pendingApprovalsResult;
      bookedOrders = bookedOrdersResult;
      pendingPayments = pendingPaymentsResult;
    } catch (error) {
      console.error("[dashboard] legacy widgets failed", error);
    }
  }

  const counts = {
    pendingTransfers,
    openQuotations,
    pendingApprovals,
    bookedOrders,
    pendingPayments,
    todaysDispatches,
  };

  return {
    role: "legacy",
    generatedAt: new Date().toISOString(),
    companyLabel: scope.companyLabel,
    showTeamComingSoon:
      roles.includes(ROLES.SALES_MANAGER) || roles.includes(ROLES.SUPER_ADMIN),
    widgets: widgetsForRoles(roles).map((title) => ({
      title,
      value: widgetValue(title, counts),
      description: widgetDescription(title, counts),
      href: widgetHref(title),
    })),
  };
}
