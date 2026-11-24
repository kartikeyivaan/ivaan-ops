import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCorrectInwardedSerial } from "@/lib/inventory-permissions";
import { correctInwardedSerialNumber } from "@/lib/serial-correction-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canCorrectInwardedSerial(session.user.roles)) {
    return errorResponse("FORBIDDEN", "Only Super Admin can correct serial numbers.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = (await request.json().catch(() => null)) as {
    serialId?: unknown;
    newSerialNumber?: unknown;
  } | null;
  if (
    !body ||
    typeof body.serialId !== "string" ||
    typeof body.newSerialNumber !== "string"
  ) {
    return errorResponse("VALIDATION_ERROR", "Serial ID and new serial number are required.", 400);
  }

  try {
    const serial = await correctInwardedSerialNumber(prisma, {
      companyId,
      serialId: body.serialId,
      newSerialNumber: body.newSerialNumber,
      updatedById: session.user.id,
    });
    return NextResponse.json({ id: serial.id, serialNumber: serial.serialNumber });
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "NOT_FOUND":
          return errorResponse("NOT_FOUND", "Serial not found.", 404);
        case "SERIAL_REQUIRED":
          return errorResponse("VALIDATION_ERROR", "New serial number is required.", 400);
        case "SERIAL_NOT_CORRECTABLE":
          return errorResponse(
            "VALIDATION_ERROR",
            "Only serials that are still in stock (available) can be corrected.",
            400,
          );
        case "NO_CHANGES":
          return errorResponse("VALIDATION_ERROR", "The new serial number is the same as the current one.", 400);
        case "DUPLICATE_SERIAL":
          return errorResponse("DUPLICATE_SERIAL", "This serial number is already in use.", 409);
      }
    }
    console.error("POST /api/inventory/serials/correct failed:", error);
    return errorResponse("SERVER_ERROR", "Failed to correct serial number.", 500);
  }
}
