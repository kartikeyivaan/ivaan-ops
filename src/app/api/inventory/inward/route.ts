import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canInwardMaterial } from "@/lib/inventory-permissions";
import { receiveMaterial } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { inwardSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canInwardMaterial(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = inwardSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid inward data.", 400, parsed.error.flatten());
  }

  if (parsed.data.receivedQty === 0 && parsed.data.damagedQty === 0) {
    return errorResponse("VALIDATION_ERROR", "Enter received or damaged quantity.", 400);
  }

  try {
    const lot = await receiveMaterial(prisma, {
      lotId: parsed.data.lotId,
      companyId,
      receivedQty: parsed.data.receivedQty,
      damagedQty: parsed.data.damagedQty,
      serialNumbers: parsed.data.serialNumbers,
      createdById: session.user.id,
    });

    return NextResponse.json(lot);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Lot not found.", 404);
      }
      if (error.message === "LOT_CLOSED") {
        return errorResponse("VALIDATION_ERROR", "This lot is already closed.", 400);
      }
      if (error.message === "SERIAL_COUNT_MISMATCH") {
        return errorResponse(
          "SERIAL_REQUIRED",
          "Serial numbers are mandatory for this product.",
          400,
        );
      }
      if (error.message === "DUPLICATE_SERIAL" || error.message === "DUPLICATE_SERIAL_IN_REQUEST") {
        return errorResponse("DUPLICATE_SERIAL", "Serial number already exists.", 409);
      }
      if (error.message.includes("exceed") || error.message.includes("negative")) {
        return errorResponse("NEGATIVE_STOCK_BLOCKED", error.message, 400);
      }
    }
    throw error;
  }
}
