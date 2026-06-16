import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewProformaInvoices } from "@/lib/pi-permissions";
import { getProformaInvoiceById } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewProformaInvoices(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const pi = await getProformaInvoiceById(prisma, companyId, id);
  if (!pi) {
    return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
  }

  return NextResponse.json(pi);
}
