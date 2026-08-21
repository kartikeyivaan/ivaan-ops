import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewSalesCreditReceipts } from "@/lib/banking-permissions";
import { listSalesDailyReceipts } from "@/lib/sales-daily-receipts-service";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds, requireActiveCompany } from "@/lib/session";
import { assertCompanyAccess } from "@/lib/customer-permissions";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewSalesCreditReceipts(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const params = new URL(request.url).searchParams;
  const requestedCompanyId = params.get("companyId")?.trim();
  const activeCompanyId = requireActiveCompany(session);
  const companyId = requestedCompanyId || activeCompanyId;
  const userCompanyIds = getSessionCompanyIds(session);

  if (!assertCompanyAccess(session.user.roles, userCompanyIds, companyId)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  try {
    const result = await listSalesDailyReceipts(prisma, {
      companyId,
      userRoles: session.user.roles,
      userCompanyIds,
      dateFrom: params.get("dateFrom")?.trim() || undefined,
      dateTo: params.get("dateTo")?.trim() || undefined,
    });

    // Accessible companies for tabs (Sales may have ISE + PCM).
    const companies = session.user.companies
      .filter((c) => !c.isPractice)
      .map((c) => ({ id: c.id, code: c.code, name: c.name }));

    return NextResponse.json({
      ...result,
      companies:
        companies.length > 0
          ? companies
          : [{ id: result.company.id, code: result.company.code, name: result.company.name }],
    });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN_COMPANY") {
      return error("Forbidden.", 403, "FORBIDDEN");
    }
    throw err;
  }
}
