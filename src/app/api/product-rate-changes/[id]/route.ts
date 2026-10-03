import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  canCreateProductRateChange,
  canViewProductRateChange,
} from "@/lib/product-rate-change-permissions";
import {
  deleteProductRateChangeBatch,
  getProductRateChangeBatch,
  updateProductRateChangeBatch,
} from "@/lib/product-rate-change-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { productRateChangeBatchSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const { id } = await context.params;
  const batch = await getProductRateChangeBatch(prisma, id);
  if (!batch) {
    return errorResponse("NOT_FOUND", "Rate change batch not found.", 404);
  }

  if (!canViewProductRateChange(session.user.roles, batch.createdById, session.user.id)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  return NextResponse.json(batch);
}

export async function PATCH(request: Request, context: RouteContext) {
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
    return errorResponse("FORBIDDEN", "You can only edit batches you created.", 403);
  }

  const body = await request.json();
  const parsed = productRateChangeBatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid rate change data.", 400, parsed.error.flatten());
  }

  try {
    const batch = await updateProductRateChangeBatch(prisma, {
      batchId: id,
      lines: parsed.data.lines,
    });

    await writeAuditLog({
      tableName: "product_rate_change_batches",
      recordId: batch.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId,
      reference: batch.requestNumber,
      newValue: batch,
    });

    return NextResponse.json(batch);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Rate change batch not found.", 404);
      }
      if (error.message === "NOT_EDITABLE") {
        return errorResponse("INVALID_STATUS", "This batch can no longer be edited.", 400);
      }
      if (error.message.startsWith("VALIDATION:")) {
        return errorResponse("VALIDATION_ERROR", error.message.slice("VALIDATION:".length), 400);
      }
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canCreateProductRateChange(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const { id } = await context.params;
  const existing = await getProductRateChangeBatch(prisma, id);
  if (!existing) {
    return errorResponse("NOT_FOUND", "Rate change batch not found.", 404);
  }
  if (existing.createdById !== session.user.id) {
    return errorResponse("FORBIDDEN", "You can only delete batches you created.", 403);
  }

  try {
    await deleteProductRateChangeBatch(prisma, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Rate change batch not found.", 404);
      }
      if (error.message === "NOT_DELETABLE") {
        return errorResponse("INVALID_STATUS", "Only draft batches can be deleted.", 400);
      }
    }
    throw error;
  }
}
