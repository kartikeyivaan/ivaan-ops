import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canInwardMaterial,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import { listIncomingLots, serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { IncomingReceiptList } from "@/components/inventory/incoming-list";

export default async function IncomingMaterialPage() {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const includeSerials = canViewSerialNumbers(session.user.roles);

  const lots = await listIncomingLots(prisma, companyId, { status: "INCOMING" });

  const sanitizedLots = lots.map((lot) => serializeLotForRole(lot, includeSerials));

  return (
    <IncomingReceiptList
      initialLots={sanitizedLots}
      canInward={canInwardMaterial(session.user.roles)}
    />
  );
}
