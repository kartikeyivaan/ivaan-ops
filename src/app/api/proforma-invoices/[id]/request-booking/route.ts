import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageProformaInvoices } from "@/lib/pi-permissions";
import { requestBooking } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requestBookingSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProformaInvoices(session.user.roles)) {
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
  const parsed = requestBookingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Warehouse is required for booking.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const pi = await requestBooking(prisma, {
      companyId,
      piId: id,
      warehouseId: parsed.data.warehouseId,
      requestedById: session.user.id,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "Only issued PIs can request booking.", 400);
      }
      if (error.message === "ADVANCE_NOT_MET") {
        return errorResponse(
          "ADVANCE_NOT_MET",
          "50% advance payment is required before booking.",
          400,
        );
      }
      if (error.message === "WAREHOUSE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Warehouse not found.", 404);
      }
      if (error.message === "BOOKING_ALREADY_REQUESTED") {
        return errorResponse("BOOKING_ALREADY_REQUESTED", "Booking already pending approval.", 400);
      }
    }
    throw error;
  }
}
