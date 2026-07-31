import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canApproveBooking } from "@/lib/pi-permissions";
import { approveBooking } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { approveBookingSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApproveBooking(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = approveBookingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid approval data.", 400, parsed.error.flatten());
  }

  try {
    const pi = await approveBooking(prisma, {
      companyId,
      piId: id,
      approvedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "PI is not pending booking approval.", 400);
      }
      if (error.message === "WAREHOUSE_REQUIRED") {
        return errorResponse("VALIDATION_ERROR", "Warehouse is required.", 400);
      }
      if (error.message === "INSUFFICIENT_STOCK") {
        return errorResponse("INSUFFICIENT_STOCK", "Insufficient stock to book order.", 400);
      }
      if (error.message.startsWith("INSUFFICIENT_PROJECTED_STOCK|")) {
        const [, product, shortage] = error.message.split("|");
        return errorResponse(
          "INSUFFICIENT_PROJECTED_STOCK",
          `Projected stock is short by ${shortage} for ${product} during the required dispatch window.`,
          400,
          { product, shortage: Number(shortage) },
        );
      }
      if (error.message === "ADVANCE_NOT_MET") {
        return errorResponse(
          "ADVANCE_NOT_MET",
          "The required payment percentage has not been received for this PI.",
          400,
        );
      }
      if (error.message === "BOOKING_NOT_ALLOWED") {
        return errorResponse(
          "BOOKING_NOT_ALLOWED",
          "The selected delivery terms do not permit stock booking.",
          400,
        );
      }
    }
    throw error;
  }
}
