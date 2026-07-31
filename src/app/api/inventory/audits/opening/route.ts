import { auth } from "@/lib/auth";
import {
  auditErrorResponse,
  mapAuditServiceError,
} from "@/lib/inventory-audit-api";
import {
  canCreateInventoryAudits,
  canViewInventoryAudits,
} from "@/lib/inventory-audit-permissions";
import {
  createOpeningAudit,
  listOpeningAudits,
  serializeOpeningAudit,
} from "@/lib/inventory-audit-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { createOpeningAuditSchema } from "@/lib/validations";

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

  const audits = await listOpeningAudits(prisma, companyId);
  return Response.json(audits);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canCreateInventoryAudits(session.user.roles)) {
    return auditErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return auditErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = createOpeningAuditSchema.safeParse(body);
  if (!parsed.success) {
    return auditErrorResponse(
      "VALIDATION_ERROR",
      "Invalid opening audit data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const audit = await createOpeningAudit(prisma, {
      companyId,
      warehouseId: parsed.data.warehouseId,
      createdById: session.user.id,
    });
    return Response.json(serializeOpeningAudit(audit), { status: 201 });
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to create opening audit.", 500)
    );
  }
}
