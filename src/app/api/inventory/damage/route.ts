import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canReportDamage } from "@/lib/inventory-permissions";
import { reportDamage } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { damageSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canReportDamage(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = damageSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid damage data.", 400, parsed.error.flatten());
  }

  try {
    const transaction = await reportDamage(prisma, {
      companyId,
      productId: parsed.data.productId,
      warehouseId: parsed.data.warehouseId,
      qty: parsed.data.qty,
      serialIds: parsed.data.serialIds,
      notes: parsed.data.notes,
      createdById: session.user.id,
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NEGATIVE_STOCK_BLOCKED") {
        return errorResponse(
          "NEGATIVE_STOCK_BLOCKED",
          "This action would create negative stock.",
          400,
        );
      }
      if (error.message === "SERIAL_REQUIRED") {
        return errorResponse(
          "SERIAL_REQUIRED",
          "Serial numbers are mandatory for this product.",
          400,
        );
      }
    }
    throw error;
  }
}
