import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canApproveIncomingLotEdit } from "@/lib/inventory-permissions";
import { rejectIncomingLotChangeRequest } from "@/lib/incoming-lot-change-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canApproveIncomingLotEdit(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body === "object" && body && "reason" in body && typeof body.reason === "string"
      ? body.reason
      : "";

  try {
    const changeRequest = await rejectIncomingLotChangeRequest(prisma, {
      companyId,
      changeRequestId: id,
      rejectedById: session.user.id,
      remarks: reason,
    });
    return NextResponse.json(changeRequest);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Change request not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "This change is not pending approval.", 400);
      }
      if (error.message === "REASON_REQUIRED") {
        return errorResponse("VALIDATION_ERROR", "A rejection reason is required.", 400);
      }
    }
    throw error;
  }
}
