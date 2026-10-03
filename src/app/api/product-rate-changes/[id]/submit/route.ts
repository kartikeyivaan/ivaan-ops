import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProductRateChange } from "@/lib/product-rate-change-permissions";
import {
  getProductRateChangeBatch,
  submitProductRateChangeBatch,
} from "@/lib/product-rate-change-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canCreateProductRateChange(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const existing = await getProductRateChangeBatch(prisma, id);
  if (!existing) {
    return errorResponse("NOT_FOUND", "Rate change batch not found.", 404);
  }
  if (existing.createdById !== session.user.id) {
    return errorResponse("FORBIDDEN", "You can only submit batches you created.", 403);
  }

  try {
    const batch = await submitProductRateChangeBatch(prisma, id);

    await writeAuditLog({
      tableName: "product_rate_change_batches",
      recordId: batch.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId,
      reference: batch.requestNumber,
      newValue: { status: batch.status, submittedAt: batch.submittedAt },
    });

    return NextResponse.json(batch);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Rate change batch not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "This batch cannot be submitted.", 400);
      }
      if (error.message === "EMPTY_BATCH") {
        return errorResponse("VALIDATION_ERROR", "Add at least one product line.", 400);
      }
      if (error.message === "MISSING_CURRENT_PRICE") {
        return errorResponse(
          "VALIDATION_ERROR",
          "One or more products do not have a current price. Configure landing and selling prices first.",
          400,
        );
      }
    }
    throw error;
  }
}
