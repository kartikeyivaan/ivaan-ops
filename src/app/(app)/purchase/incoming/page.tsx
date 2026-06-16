import { redirect } from "next/navigation";
import { decimalToNumber } from "@/lib/inventory";
import { auth } from "@/lib/auth";
import { canCreateIncoming, canViewSerialNumbers } from "@/lib/inventory-permissions";
import { listIncomingLots, listVendors, serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { getSessionCompanyIds, requireActiveCompany } from "@/lib/session";
import { PurchaseIncomingList } from "@/components/purchase/purchase-incoming-list";

export default async function PurchaseIncomingPage() {
  const session = await auth();
  if (!session?.user || !canCreateIncoming(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const includeSerials = canViewSerialNumbers(session.user.roles);
  const companyIds = getSessionCompanyIds(session);

  const [lots, products, warehouses, vendors, companies] = await Promise.all([
    listIncomingLots(prisma, companyId, {}),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, gstRate: true },
    }),
    prisma.warehouse.findMany({
      where: {
        isActive: true,
        ...(isSuperAdmin(session.user.roles) ? {} : { companyId: { in: companyIds } }),
      },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, companyId: true },
    }),
    listVendors(prisma),
    prisma.company.findMany({
      where: isSuperAdmin(session.user.roles) ? { isActive: true } : { id: { in: companyIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const sanitizedLots = lots.map((lot) => serializeLotForRole(lot, includeSerials));
  const serializedProducts = products.map((product) => ({
    id: product.id,
    displayName: product.displayName,
    gstRate: decimalToNumber(product.gstRate),
  }));

  return (
    <PurchaseIncomingList
      initialLots={sanitizedLots}
      companies={companies}
      products={serializedProducts}
      warehouses={warehouses}
      vendors={vendors}
      defaultCompanyId={companyId}
      canCreate={canCreateIncoming(session.user.roles)}
    />
  );
}
