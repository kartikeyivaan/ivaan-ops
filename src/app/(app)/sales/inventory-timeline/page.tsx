import { redirect } from "next/navigation";

import { InventoryTimeline } from "@/components/inventory/inventory-timeline";
import { auth } from "@/lib/auth";
import { canViewInventoryTimeline } from "@/lib/inventory-permissions";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";

export default async function SalesInventoryTimelinePage() {
  const session = await auth();
  if (!session?.user || !canViewInventoryTimeline(session.user.roles)) {
    redirect("/dashboard");
  }

  const companies = isSuperAdmin(session.user.roles)
    ? await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      })
    : session.user.companies;
  const companyIds = companies.map((company) => company.id);
  const [warehouses, products] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: { in: companyIds }, isActive: true },
      select: { id: true, name: true, companyId: true },
      orderBy: [{ companyId: "asc" }, { name: "asc" }],
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
  ]);

  const initialCompanyId =
    companies.find((company) => company.id === session.user.activeCompanyId)
      ?.id ??
    companies[0]?.id ??
    "";
  if (!initialCompanyId) {
    redirect("/dashboard");
  }

  return (
    <InventoryTimeline
      companies={companies}
      warehouses={warehouses}
      products={products}
      initialCompanyId={initialCompanyId}
    />
  );
}
