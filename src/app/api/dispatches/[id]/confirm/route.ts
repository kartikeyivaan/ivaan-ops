import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canManageDispatches } from "@/lib/dispatch-permissions";
import { confirmDispatch } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

/** Cross-company / interchangeable serial confirm can exceed the default 10s. */
export const maxDuration = 60;

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
      if (error.message === "CROSS_COMPANY_PLAN_REQUIRED") {
        return errorResponse(
          "CROSS_COMPANY_PLAN_REQUIRED",
          "Unable to confirm dispatch with these serials. Please retry.",
          400,
        );
      }
      if (error.message === "CROSS_COMPANY_REAPPROVAL_REQUIRED") {
        return errorResponse(
          "CROSS_COMPANY_REAPPROVAL_REQUIRED",
          "Unable to confirm dispatch with these serials. Please retry.",
          400,
        );
      }
      if (error.message === "CROSS_COMPANY_QTY_EXCEEDED") {
        return errorResponse(
          "CROSS_COMPANY_QTY_EXCEEDED",
          "Unable to confirm dispatch with these serials. Please retry.",
          400,
        );
      }
      if (error.message === "INTERCHANGEABLE_SWAP_STOCK_INSUFFICIENT") {
        return errorResponse(
          "INTERCHANGEABLE_SWAP_STOCK_INSUFFICIENT",
          "Unable to confirm dispatch with these serials. Please retry.",
          400,
        );
      }
      if (error.message === "SOURCE_INSUFFICIENT_STOCK") {
        return errorResponse(
          "SOURCE_INSUFFICIENT_STOCK",
          "Source company no longer has enough available stock for the shortfall.",
          400,
        );
      }
      if (error.message === "SYSTEM_USER_NOT_FOUND") {
        return errorResponse(
          "SYSTEM_USER_NOT_FOUND",
          "System user is required to complete cross-company stock transfer.",
          500,
        );
      }
      if (error.message === "NEGATIVE_STOCK_BLOCKED") {
        return errorResponse(
          "NEGATIVE_STOCK_BLOCKED",
          "Insufficient available stock to complete this dispatch.",
          400,
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2028"
      ) {
        return errorResponse(
          "TRANSACTION_TIMEOUT",
          "Dispatch took too long to confirm (often with cross-company serials). Please retry.",
          504,
        );
      }
    }
    throw error;
  }
}
