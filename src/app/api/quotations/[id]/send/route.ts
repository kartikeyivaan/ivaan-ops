import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PCM_QUOTATION_SUPER_ADMIN_ONLY_MESSAGE } from "@/lib/company-scope";
import { canManageQuotations, canManageQuotationsForCompany } from "@/lib/quotation-permissions";
import { sendQuotation } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageQuotations(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const activeCompany = session.user.companies.find((company) => company.id === companyId);
  if (
    activeCompany &&
    !canManageQuotationsForCompany(session.user.roles, activeCompany)
  ) {
    return errorResponse(
      "PCM_QUOTATION_SUPER_ADMIN_ONLY",
      PCM_QUOTATION_SUPER_ADMIN_ONLY_MESSAGE,
      403,
    );
  }

  const { id } = await context.params;

  try {
    const quotation = await sendQuotation(prisma, {
      companyId,
      quotationId: id,
      performedById: session.user.id,
    });
    return NextResponse.json(quotation);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Quotation not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("VALIDATION_ERROR", "Only draft quotations can be sent.", 400);
      }
      if (error.message === "PRICE_APPROVAL_REQUIRED") {
        return errorResponse(
          "PRICE_APPROVAL_REQUIRED",
          "Below-minimum pricing requires Sales Manager approval before sending.",
          400,
        );
      }
    }
    throw error;
  }
}
