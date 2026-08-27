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
import {
  canReceiveTransfer,
  canViewTransferSerials,
} from "@/lib/transfer-permissions";
import {
  listPendingIncomingTransfers,
  serializeTransferForRole,
} from "@/lib/transfer-service";
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

  const [lotsPage, products, warehouses, vendors, pendingTransfers] = await Promise.all([
    listIncomingLots(prisma, companyId, {
      status: showHistory ? "CLOSED" : "INCOMING",
      page: 1,
      pageSize: 50,
    }),
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
    showHistory ? Promise.resolve([]) : listPendingIncomingTransfers(prisma, companyId),
  ]);

  const sanitizedLots = lotsPage.items.map((lot) => serializeLotForRole(lot, includeSerials));
  const serializedProducts = products.map((product) => ({
    id: product.id,
    displayName: product.displayName,
    gstRate: decimalToNumber(product.gstRate),
  }));

  const includeTransferSerials = canViewTransferSerials(session.user.roles);
  const transferWarehouseIds = [
    ...new Set(
      pendingTransfers.flatMap((transfer) => [transfer.fromWarehouseId, transfer.toWarehouseId]),
    ),
  ];
  const transferWarehouses = transferWarehouseIds.length
    ? await prisma.warehouse.findMany({
        where: { id: { in: transferWarehouseIds } },
        select: { id: true, name: true },
      })
    : [];
  const transferWarehouseNameById = new Map(
    transferWarehouses.map((warehouse) => [warehouse.id, warehouse.name]),
  );
  const initialTransfers = pendingTransfers.map((transfer) => ({
    transfer: serializeTransferForRole(transfer, includeTransferSerials),
    fromWarehouseName: transferWarehouseNameById.get(transfer.fromWarehouseId) ?? "—",
    toWarehouseName: transferWarehouseNameById.get(transfer.toWarehouseId) ?? "—",
    pendingQty: transfer.lines.reduce(
      (sum, line) =>
        sum + (decimalToNumber(line.qty) - decimalToNumber(line.receivedQty)),
      0,
    ),
  }));

  return (
    <IncomingReceiptList
      initialLots={sanitizedLots}
      initialTotal={lotsPage.total}
      initialPage={lotsPage.page}
      initialPageSize={lotsPage.pageSize}
      canInward={canInwardMaterial(session.user.roles)}
      showHistory={showHistory}
      canExportSerials={includeSerials}
      canEditHistory={canEditHistory}
      products={serializedProducts}
      warehouses={warehouses}
      vendors={vendors}
      initialTransfers={JSON.parse(JSON.stringify(initialTransfers))}
      canReceiveTransfers={canReceiveTransfer(session.user.roles)}
    />
  );
}
