import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewQuotations } from "@/lib/quotation-permissions";
import { getQuotationById } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewQuotations(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const quotation = await getQuotationById(prisma, companyId, id);
  if (!quotation) {
    return errorResponse("NOT_FOUND", "Quotation not found.", 404);
  }

  return NextResponse.json(quotation);
}
