import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canInwardMaterial,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
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
  const lot = await getLotById(prisma, id, companyId);

  if (!lot || lot.status !== "INCOMING") {
    notFound();
  }

  const sanitizedLot = serializeLotForRole(
    lot,
    canViewSerialNumbers(session.user.roles),
  );

  return <InwardForm lot={sanitizedLot} />;
}
