import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canInwardMaterial,
  canViewInventory,
} from "@/lib/inventory-permissions";
import { listStockSummary } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { StockOverview } from "@/components/inventory/stock-overview";

export default async function InventoryPage() {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const [stock, warehouses] = await Promise.all([
    listStockSummary(prisma, companyId, {}),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <StockOverview
      initialStock={stock}
      warehouses={warehouses}
      canReceiveIncoming={canInwardMaterial(session.user.roles)}
    />
  );
}
