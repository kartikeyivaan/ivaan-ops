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
        return errorResponse("INVALID_STATUS", "Only issued PIs can be booked.", 400);
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
      if (error.message === "WAREHOUSE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Warehouse not found.", 404);
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
      if (error.message.startsWith("KIT_BOM_EMPTY|")) {
        const [, product] = error.message.split("|");
        return errorResponse(
          "KIT_BOM_EMPTY",
          `Kit "${product}" has no components configured.`,
          400,
        );
      }
    }
    throw error;
  }
}
