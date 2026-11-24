import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/rbac";
import { reopenPartialDispatchPi } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireApprovalCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    return errorResponse("FORBIDDEN", "Only a super admin can reopen a closed PI.", 403);
  }

  let companyId: string;
  try {
    companyId = requireApprovalCompany(session, request);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const remarks = typeof body?.remarks === "string" ? body.remarks : undefined;

  try {
    const pi = await reopenPartialDispatchPi(prisma, {
      companyId,
      piId: id,
      performedById: session.user.id,
      remarks,
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
          "Only a PI closed with partial dispatch can be reopened.",
          400,
        );
      }
    }
    throw error;
  }
}
