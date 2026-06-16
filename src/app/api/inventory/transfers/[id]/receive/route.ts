import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canReceiveTransfer,
  canViewTransferSerials,
} from "@/lib/transfer-permissions";
import { receiveTransfer, serializeTransferForRole } from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { receiveTransferSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canReceiveTransfer(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = receiveTransferSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid receive data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await params;

  try {
    const transfer = await receiveTransfer(prisma, {
      transferId: id,
      companyId,
      lines: parsed.data.lines,
      receivedById: session.user.id,
    });
    const includeSerials = canViewTransferSerials(session.user.roles);
    return NextResponse.json(serializeTransferForRole(transfer, includeSerials));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Transfer not found or not ready to receive.", 404);
      }
      if (error.message === "EXCEEDS_PENDING") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Received quantity exceeds pending transfer quantity.",
          400,
        );
      }
      if (error.message === "SERIAL_PARTIAL_NOT_SUPPORTED") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Serial-tracked lines must be received in full.",
          400,
        );
      }
      if (error.message === "NO_RECEIPT") {
        return errorResponse("VALIDATION_ERROR", "Enter a received quantity.", 400);
      }
    }
    throw error;
  }
}
