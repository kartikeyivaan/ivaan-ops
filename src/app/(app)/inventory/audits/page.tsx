import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveOpeningStock,
  canCreateInventoryAudits,
  canResetOpeningStock,
  canViewInventoryAudits,
} from "@/lib/inventory-audit-permissions";
import {
  getCompanyOpeningPhase,
  listDailyAudits,
  listOpeningAudits,
} from "@/lib/inventory-audit-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { InventoryAuditHub } from "@/components/inventory/inventory-audit-hub";

export default async function InventoryAuditsPage() {
  const session = await auth();
  if (!session?.user || !canViewInventoryAudits(session.user.roles)) {
    redirect("/dashboard");
  }

  const companyId = requireActiveCompany(session);
  const [phase, openingAudits, dailyAudits, warehouses] = await Promise.all([
    getCompanyOpeningPhase(prisma, companyId),
    listOpeningAudits(prisma, companyId),
    listDailyAudits(prisma, companyId),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <InventoryAuditHub
      phase={phase.inventoryOpeningPhase}
      inventoryTrackingStartDate={phase.inventoryTrackingStartDate?.toISOString() ?? null}
      warehouses={warehouses}
      openingAudits={openingAudits.map((audit) => ({
        id: audit.id,
        auditNumber: audit.auditNumber,
        status: audit.status,
        warehouseName: audit.warehouse.name,
        warehouseId: audit.warehouseId,
        lineCount: audit._count.lines,
        submittedAt: audit.submittedAt?.toISOString() ?? null,
        approvedAt: audit.approvedAt?.toISOString() ?? null,
      }))}
      dailyAudits={dailyAudits.map((audit) => ({
        id: audit.id,
        auditNumber: audit.auditNumber,
        status: audit.status,
        warehouseName: audit.warehouse.name,
        auditDate: audit.auditDate.toISOString(),
        lineCount: audit._count.lines,
        submittedAt: audit.submittedAt?.toISOString() ?? null,
      }))}
      canReset={canResetOpeningStock(session.user.roles)}
      canCreate={canCreateInventoryAudits(session.user.roles)}
      canApprove={canApproveOpeningStock(session.user.roles)}
    />
  );
}
