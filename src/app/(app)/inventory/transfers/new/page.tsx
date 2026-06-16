import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canCreateTransfer,
  canViewTransferSerials,
} from "@/lib/transfer-permissions";
import { listDestinationWarehouses } from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { TransferForm } from "@/components/inventory/transfer-form";

export default async function NewTransferPage() {
  const session = await auth();
  if (!session?.user || !canCreateTransfer(session.user.roles)) {
    redirect("/inventory/transfers");
  }

  const companyId = requireActiveCompany(session);
  const userCompanyIds = session.user.companies.map((company) => company.id);

  const [sourceWarehouses, destinationWarehouses, products] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listDestinationWarehouses(prisma, userCompanyIds),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, serialTracking: true },
    }),
  ]);

  return (
    <TransferForm
      sourceWarehouses={sourceWarehouses}
      destinationWarehouses={destinationWarehouses}
      products={products}
      canViewSerials={canViewTransferSerials(session.user.roles)}
    />
  );
}
