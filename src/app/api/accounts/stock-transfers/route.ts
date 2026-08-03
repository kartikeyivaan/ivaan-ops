import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewAccountsStockTransfers } from "@/lib/accounts-permissions";
import { listAccountsStockTransfers } from "@/lib/cross-company-transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewAccountsStockTransfers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const rows = await listAccountsStockTransfers(prisma, companyId);
  return NextResponse.json(rows);
}
