import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canApproveIncomingLotEdit } from "@/lib/inventory-permissions";
import { approveIncomingLotChangeRequest } from "@/lib/incoming-lot-change-service";
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
  const remarks =
    typeof body === "object" && body && "remarks" in body && typeof body.remarks === "string"
      ? body.remarks
      : undefined;

  try {
    const changeRequest = await approveIncomingLotChangeRequest(prisma, {
      companyId,
      changeRequestId: id,
      approvedById: session.user.id,
      remarks,
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
      if (error.message === "LOT_NOT_EDITABLE") {
        return errorResponse(
          "LOT_NOT_EDITABLE",
          "The lot can no longer be edited (receipts may already exist).",
          400,
        );
      }
      if (error.message === "DUPLICATE_PURCHASE_INVOICE") {
        return errorResponse(
          "DUPLICATE_PURCHASE_INVOICE",
          "This purchase invoice number already exists.",
          409,
        );
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proposed product is not available.", 404);
      }
    }
    throw error;
  }
}
