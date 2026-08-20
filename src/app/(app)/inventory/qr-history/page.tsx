import { redirect } from "next/navigation";
import { QrHistoryWorkbench } from "@/components/inventory/qr-history-workbench";
import { auth } from "@/lib/auth";
import { canViewQrHistory } from "@/lib/inventory-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export default async function QrHistoryPage() {
  const session = await auth();
  if (!session?.user || !canViewQrHistory(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <QrHistoryWorkbench
      activeTab="qr"
      products={products}
      warehouses={warehouses}
      canScanSerials={canViewQrHistory(session.user.roles)}
    />
  );
}
