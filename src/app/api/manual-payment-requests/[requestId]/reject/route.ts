import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rejectManualPaymentRequest } from "@/lib/manual-payment-service";
import { canDecideManualPayments } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ requestId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canDecideManualPayments(session.user.roles)) {
    return errorResponse("FORBIDDEN", "Only Accounts can decide manual payments.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { requestId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { remarks?: unknown };
  const remarks = typeof body.remarks === "string" ? body.remarks : undefined;

  try {
    const row = await rejectManualPaymentRequest(prisma, {
      companyId,
      requestId,
      decidedById: session.user.id,
      remarks,
    });
    return NextResponse.json({ id: row.id, status: row.status });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Manual payment request not found.", 404);
      }
      if (error.message === "NOT_PENDING") {
        return errorResponse("NOT_PENDING", "This request has already been decided.", 400);
      }
    }
    throw error;
  }
}
