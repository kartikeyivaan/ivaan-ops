import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canReportDamage } from "@/lib/inventory-permissions";
import { lookupDamageableSerial } from "@/lib/damage-report-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(request: Request) {
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

  const serialNumber = new URL(request.url).searchParams.get("serialNumber")?.trim() ?? "";
  if (!serialNumber) {
    return errorResponse("VALIDATION_ERROR", "Serial number is required.", 400);
  }

  try {
    const result = await lookupDamageableSerial(prisma, { companyId, serialNumber });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, [string, string, number]> = {
        SERIAL_REQUIRED: ["VALIDATION_ERROR", "Serial number is required.", 400],
        SERIAL_NOT_FOUND: ["NOT_FOUND", "Serial number not found in this company.", 404],
        NOT_MODULE: [
          "VALIDATION_ERROR",
          "Only Modules (panels) can be reported as damaged here.",
          400,
        ],
        ALREADY_PENDING: [
          "ALREADY_PENDING",
          "This panel already has a pending damage approval.",
          409,
        ],
        ALREADY_DAMAGED: ["VALIDATION_ERROR", "This panel is already marked damaged.", 400],
        SERIAL_BOOKED: [
          "VALIDATION_ERROR",
          "This panel is booked and cannot be marked damaged.",
          400,
        ],
        SERIAL_DISPATCHED: [
          "VALIDATION_ERROR",
          "This panel is dispatched and cannot be marked damaged.",
          400,
        ],
        SERIAL_NOT_AVAILABLE: [
          "VALIDATION_ERROR",
          "This panel is not available to mark as damaged.",
          400,
        ],
      };
      const mapped = map[error.message];
      if (mapped) return errorResponse(mapped[0], mapped[1], mapped[2]);
    }
    throw error;
  }
}
