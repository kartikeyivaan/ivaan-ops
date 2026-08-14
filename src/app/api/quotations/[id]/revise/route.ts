import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PCM_QUOTATION_SUPER_ADMIN_ONLY_MESSAGE } from "@/lib/company-scope";
import { canManageQuotations, canManageQuotationsForCompany } from "@/lib/quotation-permissions";
import {
  QuotationWarningsRequiredError,
  reviseQuotation,
} from "@/lib/quotation-service";
import { buildQuotationWhatsappUrl } from "@/lib/quotation-share";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { reviseQuotationSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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

  const body = await request.json();
  const parsed = reviseQuotationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid revision data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;

  try {
    const quotation = await reviseQuotation(prisma, {
      companyId,
      quotationId: id,
      createdById: session.user.id,
      notes: parsed.data.notes,
      send: parsed.data.send,
      lines: parsed.data.lines,
      deliveryTermMode: parsed.data.deliveryTermMode,
      requiredPaymentPercent: parsed.data.requiredPaymentPercent,
      dispatchMinDays: parsed.data.dispatchMinDays,
      dispatchMaxDays: parsed.data.dispatchMaxDays,
      permittedCompanyIds: session.user.companies.map((company) => company.id),
      proceedWithWarnings: parsed.data.proceedWithWarnings,
    });
    const whatsappUrl = parsed.data.send ? buildQuotationWhatsappUrl(quotation) : null;

    return NextResponse.json({ ...quotation, whatsappUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof QuotationWarningsRequiredError) {
      return errorResponse(
        "QUOTATION_WARNINGS_REQUIRED",
        "Review the quotation warnings before proceeding.",
        409,
        { warnings: error.warnings },
      );
    }
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Quotation not found.", 404);
      }
      if (error.message === "ALREADY_CONVERTED") {
        return errorResponse("VALIDATION_ERROR", "Converted quotations cannot be revised.", 400);
      }
      if (error.message === "DRAFT_CANNOT_REVISE") {
        return errorResponse("VALIDATION_ERROR", "Revise a sent quotation, not a draft.", 400);
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
