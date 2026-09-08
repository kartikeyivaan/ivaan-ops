import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewPendingDispatches } from "@/lib/pi-permissions";
import { listPendingDispatchPis } from "@/lib/pending-dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewPendingDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const salesUserId = restrictSalesUserId(session.user.roles, session.user.id);
  const result = await listPendingDispatchPis(prisma, companyId, { salesUserId });
  return NextResponse.json(result);
}
