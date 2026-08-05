import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAdjustStock } from "@/lib/inventory-permissions";
import {
  listManualStockEntries,
  serializeManualStockEntry,
} from "@/lib/manual-stock-service";
import { KIT_CATEGORY_NAME } from "@/lib/products";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ManualStockEntryWorkbench } from "@/components/inventory/manual-stock-entry-workbench";

export default async function ManualStockEntryPage() {
  const session = await auth();
  if (!session?.user || !canAdjustStock(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);

  const [products, warehouses, entries] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
        category: { name: { not: KIT_CATEGORY_NAME } },
      },
      select: {
        id: true,
        displayName: true,
        serialTracking: true,
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listManualStockEntries(prisma, companyId),
  ]);

  return (
    <ManualStockEntryWorkbench
      products={products}
      warehouses={warehouses}
      initialEntries={entries.map(serializeManualStockEntry)}
    />
  );
}
