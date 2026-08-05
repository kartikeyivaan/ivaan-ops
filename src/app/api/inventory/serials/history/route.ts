import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewSerialNumbers } from "@/lib/inventory-permissions";
import { prisma } from "@/lib/prisma";
import { getSerialPhysicalHistory } from "@/lib/serial-history-service";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewSerialNumbers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const serialNumber = new URL(request.url).searchParams.get("serialNumber");
  if (!serialNumber?.trim()) {
    return errorResponse("VALIDATION_ERROR", "serialNumber is required.", 400);
  }

  const history = await getSerialPhysicalHistory(prisma, companyId, serialNumber);
  if (!history) {
    return errorResponse("NOT_FOUND", "Serial not found for this company.", 404);
  }

  return NextResponse.json(history);
}
