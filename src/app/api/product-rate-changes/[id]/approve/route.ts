import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canApproveProductRateChange } from "@/lib/product-rate-change-permissions";
import { approveProductRateChangeBatch } from "@/lib/product-rate-change-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(_request: Request, context: RouteContext) {
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

  try {
    const batch = await approveProductRateChangeBatch(prisma, {
      batchId: id,
      userId: session.user.id,
      userRoles: session.user.roles,
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
        approvalCount: batch.approvalCount,
        appliedAt: batch.appliedAt,
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
