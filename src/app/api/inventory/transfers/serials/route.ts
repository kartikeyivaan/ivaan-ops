import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewTransfers, canViewTransferSerials } from "@/lib/transfer-permissions";
import { listAvailableSerialsForTransfer } from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewTransfers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  if (!canViewTransferSerials(session.user.roles)) {
    return NextResponse.json([]);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId");
  const productId = searchParams.get("productId");

  if (!warehouseId || !productId) {
    return errorResponse("VALIDATION_ERROR", "warehouseId and productId are required.", 400);
  }

  const serials = await listAvailableSerialsForTransfer(prisma, {
    companyId,
    warehouseId,
    productId,
  });

  return NextResponse.json(serials);
}
