import { auth } from "@/lib/auth";
import {
  auditErrorResponse,
  mapAuditServiceError,
} from "@/lib/inventory-audit-api";
import { canPerformInventoryAudits } from "@/lib/inventory-audit-permissions";
import {
  deleteOpeningLine,
  serializeOpeningAudit,
  upsertOpeningLine,
  getOpeningAudit,
} from "@/lib/inventory-audit-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { upsertOpeningLineSchema } from "@/lib/validations";
import { OpeningLineCondition } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

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
  const body = await request.json();
  const parsed = upsertOpeningLineSchema.safeParse(body);
  if (!parsed.success) {
    return auditErrorResponse(
      "VALIDATION_ERROR",
      "Invalid opening line data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    await upsertOpeningLine(prisma, {
      companyId,
      auditId: id,
      productId: parsed.data.productId,
      condition: parsed.data.condition as OpeningLineCondition,
      physicalQty: parsed.data.physicalQty,
      serialNumbers: parsed.data.serialNumbers,
      remarks: parsed.data.remarks,
    });
    const audit = await getOpeningAudit(prisma, companyId, id);
    return Response.json(serializeOpeningAudit(audit));
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to save opening line.", 500)
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
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
  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("lineId");
  if (!lineId) {
    return auditErrorResponse("VALIDATION_ERROR", "lineId is required.", 400);
  }

  try {
    await deleteOpeningLine(prisma, {
      companyId,
      auditId: id,
      lineId,
    });
    const audit = await getOpeningAudit(prisma, companyId, id);
    return Response.json(serializeOpeningAudit(audit));
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to delete opening line.", 500)
    );
  }
}
