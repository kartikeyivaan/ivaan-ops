import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canApproveDispatchToday } from "@/lib/pi-permissions";
import { approveDispatchToday } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { approveDispatchTodaySchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApproveDispatchToday(session.user.roles)) {
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
  const parsed = approveDispatchTodaySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid approval data.", 400, parsed.error.flatten());
  }

  try {
    const pi = await approveDispatchToday(prisma, {
      companyId,
      piId: id,
      approvedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "NO_PENDING_DISPATCH_TODAY") {
        return errorResponse(
          "NO_PENDING_DISPATCH_TODAY",
          "No pending dispatch-today approval for this PI.",
          400,
        );
      }
      if (error.message === "NOT_READY_FOR_DISPATCH") {
        return errorResponse(
          "NOT_READY_FOR_DISPATCH",
          "PI must be booked and fully paid before dispatch today.",
          400,
        );
      }
    }
    throw error;
  }
}
