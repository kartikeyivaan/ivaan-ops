import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canRequestPiCancel } from "@/lib/pi-permissions";
import { requestPiCancel } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requestPiCancelSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRequestPiCancel(session.user.roles)) {
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
  const parsed = requestPiCancelSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, parsed.error.flatten());
  }

  try {
    const pi = await requestPiCancel(prisma, {
      companyId,
      piId: id,
      requestedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse(
          "INVALID_STATUS",
          "Only draft, issued, pending-booking, or booked PIs can be cancelled. Cancel related delivery challans first if any exist.",
          400,
        );
      }
      if (error.message === "HAS_ACTIVE_DISPATCH") {
        return errorResponse(
          "HAS_ACTIVE_DISPATCH",
          "Cancel or complete related delivery challans before cancelling this PI.",
          400,
        );
      }
      if (error.message === "CANCEL_ALREADY_REQUESTED") {
        return errorResponse("CANCEL_ALREADY_REQUESTED", "Cancellation already pending.", 400);
      }
    }
    throw error;
  }
}
