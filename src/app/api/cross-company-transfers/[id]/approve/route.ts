import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { approveCrossCompanyTransferPlan } from "@/lib/cross-company-transfer-service";
import { canApproveDispatchToday } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  remarks: z.string().optional(),
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400);
  }

  try {
    const plan = await approveCrossCompanyTransferPlan(prisma, {
      companyId,
      planId: id,
      approvedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_PENDING_CROSS_COMPANY_TRANSFER") {
      return errorResponse(
        "NO_PENDING_CROSS_COMPANY_TRANSFER",
        "No pending cross-company transfer approval found.",
        404,
      );
    }
    throw error;
  }
}
