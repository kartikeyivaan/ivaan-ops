import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canViewAnyReport,
  canViewBookedAvailableReport,
  canViewDispatchReport,
  canViewPaymentFollowupReport,
  canViewProductMovementReport,
  canViewSalesExecutiveReport,
} from "@/lib/report-permissions";
import { prisma } from "@/lib/prisma";
import { ROLES, isSuperAdmin } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import { ReportsHub } from "@/components/reports/reports-hub";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user || !canViewAnyReport(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const roles = session.user.roles;
  const isAdmin = isSuperAdmin(roles);

  const allowedReports = [
    canViewSalesExecutiveReport(roles) ? "sales-executive" : null,
    canViewPaymentFollowupReport(roles) ? "payment-followup" : null,
    canViewProductMovementReport(roles) ? "product-movement" : null,
    canViewBookedAvailableReport(roles) ? "booked-available" : null,
    canViewDispatchReport(roles) ? "dispatch" : null,
  ].filter(Boolean) as Array<
    "sales-executive" | "payment-followup" | "product-movement" | "booked-available" | "dispatch"
  >;

  const [warehouses, salesExecutives] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        companies: { some: { companyId } },
        roles: {
          some: {
            role: {
              name: {
                in: [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN],
              },
            },
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ReportsHub
      allowedReports={allowedReports}
      warehouses={warehouses}
      salesExecutives={salesExecutives}
      canFilterByExecutive={
        isAdmin || roles.includes(ROLES.SALES_MANAGER) || roles.includes(ROLES.ACCOUNTS)
      }
      reportShortcuts={[
        ...(isAdmin || roles.includes(ROLES.PURCHASE)
          ? [{
              label: "Delayed Incoming Lots",
              description: "Review incoming lots and overdue arrival windows.",
              href: "/purchase/incoming",
            }]
          : []),
        ...(isAdmin || roles.includes(ROLES.ACCOUNTS)
          ? [{
              label: "Pending Invoice Entry",
              description: "Completed dispatches waiting for invoice details.",
              href: "/accounts/invoice-queue",
            }]
          : []),
        ...(isAdmin ||
        roles.includes(ROLES.ACCOUNTS) ||
        roles.includes(ROLES.DOCUMENTATION_EXECUTIVE)
          ? [{
              label: "Documentation Ageing / Status",
              description: "Documentation queue with status and ageing.",
              href: "/documentation",
            }]
          : []),
        ...(isAdmin ||
        roles.includes(ROLES.SALES_MANAGER) ||
        roles.includes(ROLES.SALES_EXECUTIVE) ||
        roles.includes(ROLES.WAREHOUSE) ||
        roles.includes(ROLES.PURCHASE)
          ? [{
              label: "Projected Stock",
              description: "Open the projected inventory timeline.",
              href: "/sales/inventory-timeline",
            }]
          : []),
      ]}
    />
  );
}
