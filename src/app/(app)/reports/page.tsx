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
        isSuperAdmin(roles) || roles.includes(ROLES.SALES_MANAGER) || roles.includes(ROLES.ACCOUNTS)
      }
    />
  );
}
