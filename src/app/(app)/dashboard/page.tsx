import { auth } from "@/lib/auth";
import { ROLES } from "@/lib/rbac";
import {
  countOpenQuotations,
  countPendingQuotationApprovals,
} from "@/lib/quotation-service";
import {
  countBookedOrders,
  countPendingBookingApprovals,
  countPendingPayments,
} from "@/lib/pi-service";
import {
  countPendingDispatchCancels,
  countTodaysDispatches,
} from "@/lib/dispatch-service";
import { countPendingIncomingTransfers } from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth();
  const roles = session?.user.roles ?? [];
  const activeCompany = session?.user.companies.find(
    (c) => c.id === session.user.activeCompanyId,
  );

  let pendingTransfers: number | null = null;
  let openQuotations: number | null = null;
  let pendingApprovals: number | null = null;
  let bookedOrders: number | null = null;
  let pendingPayments: number | null = null;
  let todaysDispatches: number | null = null;

  if (session?.user.activeCompanyId) {
    const companyId = requireActiveCompany(session);

    const isWarehouse = roles.includes(ROLES.WAREHOUSE);
    const isSalesish =
      roles.includes(ROLES.SALES_EXECUTIVE) ||
      roles.includes(ROLES.SALES_MANAGER) ||
      roles.includes(ROLES.SUPER_ADMIN);
    const isManagerish =
      roles.includes(ROLES.SALES_MANAGER) || roles.includes(ROLES.SUPER_ADMIN);
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
      isWarehouse ? countPendingIncomingTransfers(prisma, companyId) : Promise.resolve(null),
      isWarehouse ? countTodaysDispatches(prisma, companyId) : Promise.resolve(null),
      isSalesish
        ? countOpenQuotations(
            prisma,
            companyId,
            roles.includes(ROLES.SALES_EXECUTIVE) ? session.user.id : undefined,
          )
        : Promise.resolve(null),
      isManagerish
        ? Promise.all([
            countPendingQuotationApprovals(prisma, companyId),
            countPendingBookingApprovals(prisma, companyId),
            countPendingDispatchCancels(prisma, companyId),
          ]).then((counts) => counts.reduce((sum, value) => sum + value, 0))
        : Promise.resolve(null),
      isSalesish ? countBookedOrders(prisma, companyId) : Promise.resolve(null),
      isAccountsish ? countPendingPayments(prisma, companyId) : Promise.resolve(null),
    ]);

    pendingTransfers = pendingTransfersResult;
    todaysDispatches = todaysDispatchesResult;
    openQuotations = openQuotationsResult;
    pendingApprovals = pendingApprovalsResult;
    bookedOrders = bookedOrdersResult;
    pendingPayments = pendingPaymentsResult;
  }

  const widgets =
    roles.includes(ROLES.SUPER_ADMIN)
      ? [
          "Sales by Executive",
          "This Month Sales Value",
          "Pending Approvals",
          "Inventory Value",
          "Pending Payments",
        ]
      : roles.includes(ROLES.SALES_MANAGER)
        ? [
            "Open Quotations",
            "Booked Orders",
            "Order Value This Month",
            "Pending Approvals",
          ]
      : roles.includes(ROLES.SALES_EXECUTIVE)
        ? [
            "Open Quotations",
            "Booked Orders",
            "Order Value This Month",
            "Available Qty For Sale",
          ]
        : roles.includes(ROLES.WAREHOUSE)
          ? [
              "Today's Dispatches",
              "Pending Inwarding",
              "Low Stock",
              "Transfer Requests",
            ]
          : ["Role-based dashboard"];

  function widgetValue(widget: string): string {
    if (widget === "Transfer Requests" && pendingTransfers !== null) {
      return String(pendingTransfers);
    }
    if (widget === "Open Quotations" && openQuotations !== null) {
      return String(openQuotations);
    }
    if (widget === "Pending Approvals" && pendingApprovals !== null) {
      return String(pendingApprovals);
    }
    if (widget === "Booked Orders" && bookedOrders !== null) {
      return String(bookedOrders);
    }
    if (widget === "Pending Payments" && pendingPayments !== null) {
      return String(pendingPayments);
    }
    if (widget === "Today's Dispatches" && todaysDispatches !== null) {
      return String(todaysDispatches);
    }
    return "—";
  }

  function widgetDescription(widget: string): string {
    if (widget === "Transfer Requests" && pendingTransfers !== null) {
      return "Incoming transfers awaiting receipt";
    }
    if (widget === "Open Quotations" && openQuotations !== null) {
      return "Sent quotations still within validity";
    }
    if (widget === "Pending Approvals" && pendingApprovals !== null) {
      return "Quotations, bookings, and DC cancellations awaiting manager approval";
    }
    if (widget === "Booked Orders" && bookedOrders !== null) {
      return "Orders with approved booking and reserved stock";
    }
    if (widget === "Pending Payments" && pendingPayments !== null) {
      return "Issued PIs with outstanding balance";
    }
    if (widget === "Today's Dispatches" && todaysDispatches !== null) {
      return "Delivery challans dispatched today";
    }
    return "Placeholder for Sprint 1 module data";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {activeCompany
            ? `Working in ${activeCompany.name} (${activeCompany.code})`
            : "No active company selected"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {widgets.map((widget) => (
          <Card key={widget}>
            <CardHeader>
              <CardTitle className="text-base">{widget}</CardTitle>
              <CardDescription>{widgetDescription(widget)}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">{widgetValue(widget)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
