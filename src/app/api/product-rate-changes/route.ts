import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  canCreateProductRateChange,
  canViewAllProductRateChanges,
} from "@/lib/product-rate-change-permissions";
import {
  createProductRateChangeBatch,
  listProductRateChangeBatches,
} from "@/lib/product-rate-change-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { productRateChangeBatchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canCreateProductRateChange(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const batches = await listProductRateChangeBatches(prisma, {
    viewerId: session.user.id,
    viewAll: canViewAllProductRateChanges(session.user.roles),
  });

  return NextResponse.json(batches);
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const parsed = productRateChangeBatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid rate change data.", 400, parsed.error.flatten());
  }

  try {
    const batch = await createProductRateChangeBatch(prisma, {
      createdById: session.user.id,
      lines: parsed.data.lines,
    });

    await writeAuditLog({
      tableName: "product_rate_change_batches",
      recordId: batch.id,
      action: "CREATE",
      performedBy: session.user.id,
      companyId,
      reference: batch.requestNumber,
      newValue: batch,
    });

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("VALIDATION:")) {
      return errorResponse("VALIDATION_ERROR", error.message.slice("VALIDATION:".length), 400);
    }
    throw error;
  }
}
