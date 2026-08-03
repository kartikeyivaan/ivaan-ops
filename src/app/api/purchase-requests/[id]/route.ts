import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canAccessPurchaseRequestCompany,
  canManagePurchaseRequests,
  canRaisePurchaseRequest,
  canViewAllPurchaseRequests,
  getAccessiblePurchaseCompanyIds,
} from "@/lib/purchase-request-permissions";
import {
  getPurchaseRequest,
  updatePurchaseRequestStatus,
} from "@/lib/purchase-request-service";
import { prisma } from "@/lib/prisma";
import { updatePurchaseRequestStatusSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const companyIds = await getAccessiblePurchaseCompanyIds(prisma, session);
  if (!companyIds.length) {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const request = await getPurchaseRequest(prisma, id);
  if (!request || !canAccessPurchaseRequestCompany(companyIds, request.companyId)) {
    return errorResponse("NOT_FOUND", "Purchase request not found.", 404);
  }

  if (
    !canViewAllPurchaseRequests(session.user.roles) &&
    request.requestedById !== session.user.id
  ) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  return NextResponse.json(request);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const companyIds = await getAccessiblePurchaseCompanyIds(prisma, session);
  if (!companyIds.length) {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const existing = await getPurchaseRequest(prisma, id);
  if (!existing || !canAccessPurchaseRequestCompany(companyIds, existing.companyId)) {
    return errorResponse("NOT_FOUND", "Purchase request not found.", 404);
  }

  const body = await request.json();
  const parsed = updatePurchaseRequestStatusSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid status update.", 400, parsed.error.flatten());
  }

  const asManager = canManagePurchaseRequests(session.user.roles);

  try {
    const updated = await updatePurchaseRequestStatus(prisma, {
      id,
      status: parsed.data.status,
      statusRemarks: parsed.data.statusRemarks,
      updatedById: session.user.id,
      asManager,
      actorUserId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, [number, string, string]> = {
        NOT_FOUND: [404, "NOT_FOUND", "Purchase request not found."],
        ALREADY_CLOSED: [400, "VALIDATION_ERROR", "This purchase request is already closed."],
        INVALID_STATUS: [400, "VALIDATION_ERROR", "That status cannot be set manually."],
        REMARKS_REQUIRED: [400, "VALIDATION_ERROR", "Remarks are required for this status."],
        FORBIDDEN: [403, "FORBIDDEN", "You do not have permission for this action."],
        CANNOT_CANCEL: [400, "VALIDATION_ERROR", "Only open requests can be cancelled by the requester."],
      };
      const mapped = map[error.message];
      if (mapped) {
        return errorResponse(mapped[1], mapped[2], mapped[0]);
      }
    }
    console.error("updatePurchaseRequestStatus failed", error);
    return errorResponse("INTERNAL_ERROR", "Could not update purchase request.", 500);
  }
}
