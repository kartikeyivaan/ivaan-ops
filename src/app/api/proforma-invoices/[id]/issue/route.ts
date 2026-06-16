import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageProformaInvoices } from "@/lib/pi-permissions";
import { issueProformaInvoice } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProformaInvoices(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;

  try {
    const pi = await issueProformaInvoice(prisma, {
      companyId,
      piId: id,
      performedById: session.user.id,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "Only draft PIs can be issued.", 400);
      }
    }
    throw error;
  }
}
