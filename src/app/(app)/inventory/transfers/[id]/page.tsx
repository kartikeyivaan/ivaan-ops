import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canCancelTransfer,
  canDispatchTransfer,
  canReceiveTransfer,
  canViewTransfers,
  canViewTransferSerials,
} from "@/lib/transfer-permissions";
import {
  getTransferById,
  serializeTransferForRole,
} from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { TransferDetail } from "@/components/inventory/transfer-detail";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canViewTransfers(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;

  const transfer = await getTransferById(prisma, id, companyId);
  if (!transfer) notFound();

  const warehouses = await prisma.warehouse.findMany({
    where: {
      id: { in: [transfer.fromWarehouseId, transfer.toWarehouseId] },
    },
    select: { id: true, name: true },
  });

  const fromWarehouseName =
    warehouses.find((w) => w.id === transfer.fromWarehouseId)?.name ?? "—";
  const toWarehouseName =
    warehouses.find((w) => w.id === transfer.toWarehouseId)?.name ?? "—";

  const includeSerials = canViewTransferSerials(session.user.roles);

  return (
    <TransferDetail
      transfer={serializeTransferForRole(transfer, includeSerials)}
      activeCompanyId={companyId}
      canDispatch={canDispatchTransfer(session.user.roles)}
      canReceive={canReceiveTransfer(session.user.roles)}
      canCancel={canCancelTransfer(session.user.roles)}
      canViewSerials={includeSerials}
      fromWarehouseName={fromWarehouseName}
      toWarehouseName={toWarehouseName}
    />
  );
}
