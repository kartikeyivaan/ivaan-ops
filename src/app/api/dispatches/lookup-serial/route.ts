import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageDispatches } from "@/lib/dispatch-permissions";
import { lookupBookedSerialForDispatch } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const piId = searchParams.get("piId");
  const serialNumber = searchParams.get("serialNumber");
  const productId = searchParams.get("productId") ?? undefined;
  if (!piId || !serialNumber) {
    return errorResponse("VALIDATION_ERROR", "piId and serialNumber are required.", 400);
  }

  try {
    const serial = await lookupBookedSerialForDispatch(prisma, {
      companyId,
      piId,
      serialNumber,
      productId,
    });
    return NextResponse.json(serial);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "WRONG_PRODUCT") {
        return errorResponse("WRONG_PRODUCT", "Serial belongs to a different product.", 400);
      }
      if (error.message === "SERIAL_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Serial not found or not available.", 404);
      }
    }
    throw error;
  }
}
