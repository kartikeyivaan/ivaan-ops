import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canRecordQueuedDispatch } from "@/lib/pi-permissions";
import { getQueuedPiForDispatch } from "@/lib/pending-dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRecordQueuedDispatch(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const salesUserId = restrictSalesUserId(session.user.roles, session.user.id);

  try {
    const result = await getQueuedPiForDispatch(prisma, companyId, id, { salesUserId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Pending dispatch PI not found.", 404);
      }
      if (error.message === "HAS_OPEN_DISPATCH") {
        return errorResponse(
          "HAS_OPEN_DISPATCH",
          "A delivery challan is already in progress. Finish or cancel it first.",
          409,
        );
      }
      if (error.message === "INVALID_PI_STATUS" || error.message === "NOTHING_TO_DISPATCH") {
        return errorResponse(
          "INVALID_STATUS",
          "This PI is not available for recording dispatch.",
          400,
        );
      }
    }
    throw error;
  }
}
