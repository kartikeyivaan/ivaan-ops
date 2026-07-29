import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSafetyStock } from "@/lib/safety-stock-permissions";
import { requireActiveCompany } from "@/lib/session";
import { SafetyStockManager } from "@/components/inventory/safety-stock-manager";

export default async function SafetyStockPage() {
  const session = await auth();
  if (!session?.user || !canManageSafetyStock(session.user.roles)) redirect("/dashboard");
  const companyId = requireActiveCompany(session);
  const [rows, warehouses, products] = await Promise.all([
    prisma.inventorySafetyStock.findMany({
      where: { companyId, isActive: true },
      include: { warehouse: { select: { name: true } }, product: { select: { displayName: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.warehouse.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
  ]);
  return <SafetyStockManager rows={JSON.parse(JSON.stringify(rows))} warehouses={warehouses} products={products} />;
}
