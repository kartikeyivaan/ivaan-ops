import { auth } from "@/lib/auth";
import {
  auditErrorResponse,
  mapAuditServiceError,
} from "@/lib/inventory-audit-api";
import {
  canResetOpeningStock,
  canViewInventoryAudits,
} from "@/lib/inventory-audit-permissions";
import {
  getCompanyOpeningPhase,
  listDailyAudits,
  listOpeningAudits,
  startOpeningStockPreparation,
} from "@/lib/inventory-audit-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewInventoryAudits(session.user.roles)) {
    return auditErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return auditErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

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

  return Response.json({
    phase: phase.inventoryOpeningPhase,
    inventoryTrackingStartDate: phase.inventoryTrackingStartDate,
    warehouses,
    openingAudits,
    dailyAudits,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canResetOpeningStock(session.user.roles)) {
    return auditErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return auditErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json().catch(() => ({}));
  if (body?.action !== "start_opening") {
    return auditErrorResponse(
      "VALIDATION_ERROR",
      "Unsupported action. Use action: start_opening.",
      400,
    );
  }

  try {
    const result = await startOpeningStockPreparation(prisma, {
      companyId,
      performedById: session.user.id,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to start opening stock.", 500)
    );
  }
}
