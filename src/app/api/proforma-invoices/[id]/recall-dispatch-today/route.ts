import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canRecallDispatchToday } from "@/lib/pi-permissions";
import { recallDispatchToday } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRecallDispatchToday(session.user.roles)) {
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
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : undefined;

  try {
    const pi = await recallDispatchToday(prisma, {
      companyId,
      piId: id,
      recalledById: session.user.id,
      reason,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "NOTHING_TO_RECALL") {
        return errorResponse(
          "NOTHING_TO_RECALL",
          "There is no pending or active dispatch today to recall.",
          400,
        );
      }
      if (error.message === "HAS_ACTIVE_DISPATCH") {
        return errorResponse(
          "HAS_ACTIVE_DISPATCH",
          "Cannot recall dispatch today while a delivery challan is in progress. Cancel or complete the DC first.",
          400,
        );
      }
      if (error.message === "TRANSFER_ALREADY_COMPLETED") {
        return errorResponse(
          "TRANSFER_ALREADY_COMPLETED",
          "Cannot recall dispatch today after the cross-company stock transfer has completed.",
          400,
        );
      }
    }
    throw error;
  }
}
