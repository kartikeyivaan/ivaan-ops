import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canClosePartialPi } from "@/lib/pi-permissions";
import { closePartialDispatchPi } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { closePartialDispatchPiSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canClosePartialPi(session.user.roles)) {
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
  const parsed = closePartialDispatchPiSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, parsed.error.flatten());
  }

  try {
    const pi = await closePartialDispatchPi(prisma, {
      companyId,
      piId: id,
      performedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "ALREADY_CLOSED") {
        return errorResponse("ALREADY_CLOSED", "This PI is already closed with partial dispatch.", 400);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse(
          "INVALID_STATUS",
          "Only a partially dispatched PI can be closed. Fully dispatched PIs are already complete.",
          400,
        );
      }
      if (error.message === "NOTHING_TO_CLOSE") {
        return errorResponse(
          "NOTHING_TO_CLOSE",
          "There is no remaining quantity to release on this PI.",
          400,
        );
      }
      if (error.message === "HAS_OPEN_DISPATCH") {
        return errorResponse(
          "HAS_OPEN_DISPATCH",
          "Complete or cancel open delivery challans before closing this PI.",
          400,
        );
      }
    }
    throw error;
  }
}
