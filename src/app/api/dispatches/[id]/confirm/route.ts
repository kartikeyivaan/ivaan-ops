import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageDispatches } from "@/lib/dispatch-permissions";
import { confirmDispatch } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
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

  const { id } = await context.params;

  try {
    const dispatch = await confirmDispatch(prisma, {
      companyId,
      dispatchId: id,
      performedById: session.user.id,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Dispatch not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "Only draft dispatches can be confirmed.", 400);
      }
      if (error.message === "EXCEEDS_REMAINING_QTY") {
        return errorResponse("VALIDATION_ERROR", "Quantity exceeds remaining booked qty.", 400);
      }
      if (error.message === "INVALID_SERIAL_SELECTION") {
        return errorResponse("VALIDATION_ERROR", "Invalid serial selection.", 400);
      }
      if (error.message === "MANDATORY_DISPATCH_FIELDS_REQUIRED") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Receiver name, receiver mobile and vehicle number are required.",
          400,
        );
      }
    }
    throw error;
  }
}
