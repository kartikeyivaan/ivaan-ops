import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageDispatches } from "@/lib/dispatch-permissions";
import { requestDispatchCancel } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requestDispatchCancelSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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
  const body = await request.json().catch(() => ({}));
  const parsed = requestDispatchCancelSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, parsed.error.flatten());
  }

  try {
    const dispatch = await requestDispatchCancel(prisma, {
      companyId,
      dispatchId: id,
      requestedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Dispatch not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "Only dispatched DCs can be cancelled.", 400);
      }
      if (error.message === "CANCEL_ALREADY_REQUESTED") {
        return errorResponse("CANCEL_ALREADY_REQUESTED", "Cancellation already pending.", 400);
      }
    }
    throw error;
  }
}
