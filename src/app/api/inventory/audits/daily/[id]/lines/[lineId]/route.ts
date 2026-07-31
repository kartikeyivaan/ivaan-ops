import { auth } from "@/lib/auth";
import {
  auditErrorResponse,
  mapAuditServiceError,
} from "@/lib/inventory-audit-api";
import {
  canPerformInventoryAudits,
  canSeeBlindSystemQty,
} from "@/lib/inventory-audit-permissions";
import {
  getDailyAudit,
  serializeDailyAudit,
  updateDailyAuditLine,
} from "@/lib/inventory-audit-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { updateDailyAuditLineSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string; lineId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !canPerformInventoryAudits(session.user.roles)) {
    return auditErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return auditErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id, lineId } = await params;
  const body = await request.json();
  const parsed = updateDailyAuditLineSchema.safeParse(body);
  if (!parsed.success) {
    return auditErrorResponse(
      "VALIDATION_ERROR",
      "Invalid daily count data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    await updateDailyAuditLine(prisma, {
      companyId,
      auditId: id,
      lineId,
      physicalQty: parsed.data.physicalQty,
      remarks: parsed.data.remarks,
    });
    const audit = await getDailyAudit(prisma, companyId, id);
    return Response.json(
      serializeDailyAudit(audit, {
        revealSystemQty: canSeeBlindSystemQty(session.user.roles),
      }),
    );
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to update daily count.", 500)
    );
  }
}
