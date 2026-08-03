import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeDispatchTodayStockCheck } from "@/lib/cross-company-transfer-service";
import { canMarkDispatchToday } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canMarkDispatchToday(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!pi) return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);

  const check = await computeDispatchTodayStockCheck(prisma, {
    companyId,
    piId: id,
  });
  return NextResponse.json(check);
}
