import { redirect } from "next/navigation";
import { decimalToNumber } from "@/lib/inventory";
import { auth } from "@/lib/auth";
import {
  canEditClosedIncomingLot,
  canInwardMaterial,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import { listIncomingLots, listVendors, serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { getSessionCompanyIds, requireActiveCompany } from "@/lib/session";
import { IncomingReceiptList } from "@/components/inventory/incoming-list";

type PageProps = {
  searchParams: Promise<{
    view?: string;
  }>;
};

export default async function IncomingMaterialPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const includeSerials = canViewSerialNumbers(session.user.roles);
  const params = await searchParams;
  const showHistory = params.view === "history";
  const canEditHistory = canEditClosedIncomingLot(session.user.roles);
  const companyIds = getSessionCompanyIds(session);

  const [lots, products, warehouses, vendors] = await Promise.all([
    listIncomingLots(prisma, companyId, {}),
    canEditHistory
      ? prisma.product.findMany({
          where: { isActive: true },
          orderBy: { displayName: "asc" },
          select: { id: true, displayName: true, gstRate: true },
        })
      : Promise.resolve([]),
    canEditHistory
      ? prisma.warehouse.findMany({
          where: {
            isActive: true,
            ...(isSuperAdmin(session.user.roles) ? {} : { companyId: { in: companyIds } }),
          },
          orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
          select: { id: true, name: true, companyId: true },
        })
      : Promise.resolve([]),
    canEditHistory ? listVendors(prisma) : Promise.resolve([]),
  ]);

  const sanitizedLots = lots.map((lot) => serializeLotForRole(lot, includeSerials));
  const serializedProducts = products.map((product) => ({
    id: product.id,
    displayName: product.displayName,
    gstRate: decimalToNumber(product.gstRate),
  }));

  return (
    <IncomingReceiptList
      initialLots={sanitizedLots}
      canInward={canInwardMaterial(session.user.roles)}
      showHistory={showHistory}
      canExportSerials={includeSerials}
      canEditHistory={canEditHistory}
      products={serializedProducts}
      warehouses={warehouses}
      vendors={vendors}
    />
  );
}
