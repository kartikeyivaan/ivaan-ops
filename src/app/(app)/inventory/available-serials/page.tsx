import { redirect } from "next/navigation";
import { AvailableSerialsView } from "@/components/inventory/available-serials-view";
import { auth } from "@/lib/auth";
import { canViewAvailableSerials } from "@/lib/inventory-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export default async function AvailableSerialsPage() {
  const session = await auth();
  if (!session?.user || !canViewAvailableSerials(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);

  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, serialTracking: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <AvailableSerialsView products={products} warehouses={warehouses} />;
}
