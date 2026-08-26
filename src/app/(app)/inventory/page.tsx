import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  formatAllCompaniesLabel,
  isAllCompaniesScope,
  resolveDashboardCompanyIds,
} from "@/lib/company-scope";
import {
  canAdjustStock,
  canInwardMaterial,
  canViewDamagedItems,
  canViewInventory,
} from "@/lib/inventory-permissions";
import { listStockSummary } from "@/lib/inventory-service";
import { operationalCompanies } from "@/lib/learning/mode";
import { prisma } from "@/lib/prisma";
import { StockOverview } from "@/components/inventory/stock-overview";

export default async function InventoryPage() {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyIds = resolveDashboardCompanyIds(session);
  const operational = operationalCompanies(session.user.companies ?? []);
  const combinedView =
    isAllCompaniesScope(session.user.activeCompanyId) && companyIds.length > 1;

  const [stock, warehouseRows] = await Promise.all([
    listStockSummary(prisma, companyIds, {}),
    prisma.warehouse.findMany({
      where: { companyId: { in: companyIds }, isActive: true },
      include: { company: { select: { code: true } } },
      orderBy: combinedView
        ? [{ company: { code: "asc" } }, { name: "asc" }]
        : { name: "asc" },
    }),
  ]);

  const warehouses = warehouseRows.map((warehouse) => ({
    id: warehouse.id,
    name: combinedView
      ? `${warehouse.company.code} — ${warehouse.name}`
      : warehouse.name,
  }));

  return (
    <StockOverview
      initialStock={stock}
      warehouses={warehouses}
      scopeLabel={combinedView ? formatAllCompaniesLabel(operational) : undefined}
      canReceiveIncoming={canInwardMaterial(session.user.roles)}
      canViewDamaged={canViewDamagedItems(session.user.roles)}
      canManualStock={canAdjustStock(session.user.roles)}
    />
  );
}
