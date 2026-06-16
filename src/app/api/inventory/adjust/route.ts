import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAdjustStock } from "@/lib/inventory-permissions";
import { adjustStock } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { adjustStockSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canAdjustStock(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = adjustStockSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid adjustment data.", 400, parsed.error.flatten());
  }

  if (parsed.data.qty === 0) {
    return errorResponse("VALIDATION_ERROR", "Adjustment quantity cannot be zero.", 400);
  }

  try {
    const transaction = await adjustStock(prisma, {
      companyId,
      productId: parsed.data.productId,
      warehouseId: parsed.data.warehouseId,
      qty: parsed.data.qty,
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
      if (error.message === "SERIAL_ADJUST_NOT_SUPPORTED") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Manual adjustment is not supported for serial-tracked products.",
          400,
        );
      }
    }
    throw error;
  }
}
