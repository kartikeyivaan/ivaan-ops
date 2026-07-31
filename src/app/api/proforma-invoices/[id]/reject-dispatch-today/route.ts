import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canApproveDispatchToday } from "@/lib/pi-permissions";
import { rejectDispatchToday } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { rejectApprovalSchema } from "@/lib/validations";
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
  const parsed = rejectApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "A rejection reason is required (min 3 characters).",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const pi = await rejectDispatchToday(prisma, {
      companyId,
      piId: id,
      rejectedById: session.user.id,
      reason: parsed.data.reason,
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
    }
    throw error;
  }
}
