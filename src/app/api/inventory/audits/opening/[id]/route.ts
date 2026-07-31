import { auth } from "@/lib/auth";
import {
  auditErrorResponse,
  mapAuditServiceError,
} from "@/lib/inventory-audit-api";
import {
  canApproveOpeningStock,
  canPerformInventoryAudits,
  canViewInventoryAudits,
} from "@/lib/inventory-audit-permissions";
import {
  approveOpeningAudit,
  getOpeningAudit,
  rejectOpeningAudit,
  serializeOpeningAudit,
  submitOpeningAudit,
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
    const audit = await getOpeningAudit(prisma, companyId, id);
    return Response.json(serializeOpeningAudit(audit));
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to load opening audit.", 500)
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
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
  const action = body?.action as string | undefined;

  try {
    if (action === "submit") {
      if (!canPerformInventoryAudits(session.user.roles)) {
        return auditErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
      }
      const audit = await submitOpeningAudit(prisma, {
        companyId,
        auditId: id,
        submittedById: session.user.id,
      });
      return Response.json(serializeOpeningAudit(audit));
    }

    if (action === "approve") {
      if (!canApproveOpeningStock(session.user.roles)) {
        return auditErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
      }
      const audit = await approveOpeningAudit(prisma, {
        companyId,
        auditId: id,
        approvedById: session.user.id,
      });
      return Response.json(serializeOpeningAudit(audit));
    }

    if (action === "reject") {
      if (!canApproveOpeningStock(session.user.roles)) {
        return auditErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
      }
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      if (reason.length < 3) {
        return auditErrorResponse(
          "VALIDATION_ERROR",
          "A rejection reason is required (min 3 characters).",
          400,
        );
      }
      const audit = await rejectOpeningAudit(prisma, {
        companyId,
        auditId: id,
        rejectedById: session.user.id,
        reason,
      });
      return Response.json(serializeOpeningAudit(audit));
    }

    return auditErrorResponse(
      "VALIDATION_ERROR",
      "Unsupported action. Use submit, approve, or reject.",
      400,
    );
  } catch (error) {
    return (
      mapAuditServiceError(error) ??
      auditErrorResponse("INTERNAL_ERROR", "Failed to update opening audit.", 500)
    );
  }
}
