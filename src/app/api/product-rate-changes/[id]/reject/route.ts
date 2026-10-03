import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canApproveProductRateChange } from "@/lib/product-rate-change-permissions";
import { rejectProductRateChangeBatch } from "@/lib/product-rate-change-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { rejectApprovalSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApproveProductRateChange(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = rejectApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "A rejection reason is required.", 400, parsed.error.flatten());
  }

  try {
    const batch = await rejectProductRateChangeBatch(prisma, {
      batchId: id,
      userId: session.user.id,
      userRoles: session.user.roles,
      reason: parsed.data.reason,
    });

    await writeAuditLog({
      tableName: "product_rate_change_batches",
      recordId: batch.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId,
      reference: batch.requestNumber,
      newValue: {
        status: batch.status,
        rejectionReason: batch.rejectionReason,
      },
    });

    return NextResponse.json(batch);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Rate change batch not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "This batch is not pending approval.", 400);
      }
      if (error.message === "FORBIDDEN") {
        return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
      }
    }
    throw error;
  }
}
