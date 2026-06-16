import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canDispatchTransfer,
  canViewTransferSerials,
} from "@/lib/transfer-permissions";
import { dispatchTransfer, serializeTransferForRole } from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canDispatchTransfer(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await params;

  try {
    const transfer = await dispatchTransfer(prisma, {
      transferId: id,
      companyId,
      dispatchedById: session.user.id,
    });
    const includeSerials = canViewTransferSerials(session.user.roles);
    return NextResponse.json(serializeTransferForRole(transfer, includeSerials));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Transfer not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("VALIDATION_ERROR", "Only draft transfers can be dispatched.", 400);
      }
      if (error.message === "NEGATIVE_STOCK_BLOCKED") {
        return errorResponse("NEGATIVE_STOCK_BLOCKED", "Insufficient available stock.", 400);
      }
    }
    throw error;
  }
}
