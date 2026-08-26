import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canViewAnyReport,
  canViewBookedAvailableReport,
  canViewCollectionReport,
  canViewDispatchReport,
  canViewExecutivePerformanceReport,
  canViewExecutiveSalesReport,
  canViewPaymentFollowupReport,
  canViewProductMovementReport,
  canViewReservedQtyReport,
  canViewSalesExecutiveReport,
  canViewSalesFunnelReport,
  canViewSalesPerformanceReport,
} from "@/lib/report-permissions";
import { prisma } from "@/lib/prisma";
import { ROLES, isSuperAdmin } from "@/lib/rbac";
import { operationalCompanies } from "@/lib/learning/mode";
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

  const reportCompanies = isAdmin
    ? await prisma.company.findMany({
        where: { isActive: true, isPractice: false },
        select: { id: true, name: true, code: true },
        orderBy: { code: "asc" },
      })
    : operationalCompanies(session.user.companies ?? []);
  const reportCompanyIds = reportCompanies.map((company) => company.id);

  const allowedReports = [
    canViewSalesExecutiveReport(roles) ? "sales-executive" : null,
    canViewSalesPerformanceReport(roles) ? "sales-performance" : null,
    canViewSalesFunnelReport(roles) ? "sales-funnel" : null,
    canViewExecutivePerformanceReport(roles) ? "executive-performance" : null,
    canViewCollectionReport(roles) ? "collection" : null,
    canViewPaymentFollowupReport(roles) ? "payment-followup" : null,
    canViewProductMovementReport(roles) ? "product-movement" : null,
    canViewBookedAvailableReport(roles) ? "booked-available" : null,
    canViewReservedQtyReport(roles) ? "reserved-qty" : null,
    canViewDispatchReport(roles) ? "dispatch" : null,
    canViewExecutiveSalesReport(roles) ? "executive-sales" : null,
  ].filter(Boolean) as Array<
    | "sales-executive"
    | "sales-performance"
    | "sales-funnel"
    | "executive-performance"
    | "collection"
    | "payment-followup"
    | "product-movement"
    | "booked-available"
    | "reserved-qty"
    | "dispatch"
    | "executive-sales"
  >;

  const [warehouses, products, salesExecutives] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        companies: { some: { companyId: { in: reportCompanyIds } } },
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
      distinct: ["id"],
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading reports…</div>}>
      <ReportsHub
        allowedReports={allowedReports}
        companies={reportCompanies}
        warehouses={warehouses}
        products={products}
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
    </Suspense>
  );
}
