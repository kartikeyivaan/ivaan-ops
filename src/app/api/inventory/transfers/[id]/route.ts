import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canCancelTransfer,
  canViewTransferSerials,
  canViewTransfers,
} from "@/lib/transfer-permissions";
import {
  cancelTransfer,
  getTransferById,
  serializeTransferForRole,
} from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canViewTransfers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await params;
  const transfer = await getTransferById(prisma, id, companyId);
  if (!transfer) {
    return errorResponse("NOT_FOUND", "Transfer not found.", 404);
  }

  const includeSerials = canViewTransferSerials(session.user.roles);
  return NextResponse.json(serializeTransferForRole(transfer, includeSerials));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canCancelTransfer(session.user.roles)) {
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
    const transfer = await cancelTransfer(prisma, {
      transferId: id,
      companyId,
      cancelledById: session.user.id,
    });
    const includeSerials = canViewTransferSerials(session.user.roles);
    return NextResponse.json(serializeTransferForRole(transfer, includeSerials));
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Transfer not found or cannot be cancelled.", 404);
    }
    throw error;
  }
}
