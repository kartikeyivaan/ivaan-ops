import { auth } from "@/lib/auth";
import {
  auditErrorResponse,
  mapAuditServiceError,
} from "@/lib/inventory-audit-api";
import {
  canPerformInventoryAudits,
  canSeeBlindSystemQty,
  canViewInventoryAudits,
} from "@/lib/inventory-audit-permissions";
import {
  getDailyAudit,
  serializeDailyAudit,
  submitDailyAudit,
} from "@/lib/inventory-audit-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
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

  const { id } = await params;
  try {
    const audit = await getDailyAudit(prisma, companyId, id);
    return Response.json(
      serializeDailyAudit(audit, {
        revealSystemQty: canSeeBlindSystemQty(session.user.roles),
      }),
    );
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to load daily audit.", 500)
    );
  }
}

export async function POST(request: Request, { params }: Params) {
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

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "submit") {
    return auditErrorResponse(
      "VALIDATION_ERROR",
      "Unsupported action. Use action: submit.",
      400,
    );
  }

  try {
    const audit = await submitDailyAudit(prisma, {
      companyId,
      auditId: id,
      submittedById: session.user.id,
    });
    return Response.json(
      serializeDailyAudit(audit, {
        revealSystemQty: true,
      }),
    );
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to submit daily audit.", 500)
    );
  }
}
