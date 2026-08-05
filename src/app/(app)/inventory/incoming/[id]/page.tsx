import { notFound, redirect } from "next/navigation";
import { decimalToNumber } from "@/lib/inventory";
import { auth } from "@/lib/auth";
import {
  canApplyIncomingLotReceiveEdit,
  canInwardMaterial,
  canProposeIncomingLotReceiveEdit,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import { getPendingIncomingLotChangeForLot } from "@/lib/incoming-lot-change-service";
import { getLotById, serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { InwardForm } from "@/components/inventory/inward-form";

export default async function InwardLotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    redirect("/dashboard");
  }

  if (!canInwardMaterial(session.user.roles)) {
    redirect("/inventory/incoming");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const [lot, products, pendingChange] = await Promise.all([
    getLotById(prisma, id, companyId),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, gstRate: true },
    }),
    getPendingIncomingLotChangeForLot(prisma, id, companyId),
  ]);

  if (!lot || lot.status !== "INCOMING") {
    notFound();
  }

  const sanitizedLot = serializeLotForRole(
    lot,
    canViewSerialNumbers(session.user.roles),
  );
  const serializedProducts = products.map((product) => ({
    id: product.id,
    displayName: product.displayName,
    gstRate: decimalToNumber(product.gstRate),
  }));

  const canEditLot = canProposeIncomingLotReceiveEdit(session.user.roles);
  const requiresEditApproval = !canApplyIncomingLotReceiveEdit(session.user.roles);

  return (
    <InwardForm
      lot={sanitizedLot}
      products={serializedProducts}
      canEditLot={canEditLot}
      requiresEditApproval={requiresEditApproval}
      pendingChange={pendingChange}
    />
  );
}
