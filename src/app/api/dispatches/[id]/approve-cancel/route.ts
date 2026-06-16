import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canApproveDispatchCancel } from "@/lib/dispatch-permissions";
import { approveDispatchCancel } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { approveDispatchCancelSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApproveDispatchCancel(session.user.roles)) {
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
  const parsed = approveDispatchCancelSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, parsed.error.flatten());
  }

  try {
    const dispatch = await approveDispatchCancel(prisma, {
      companyId,
      dispatchId: id,
      approvedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Dispatch not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "DC is not pending cancellation.", 400);
      }
    }
    throw error;
  }
}
