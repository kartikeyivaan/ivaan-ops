import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBankingDashboard } from "@/lib/banking-query-service";
import { canAccessBankingAdmin } from "@/lib/banking-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canAccessBankingAdmin(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const companyId = requireActiveCompany(session);
  const dashboard = await getBankingDashboard(prisma, companyId);
  return NextResponse.json(dashboard);
}
