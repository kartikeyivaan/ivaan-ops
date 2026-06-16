import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { canManageProformaInvoices } from "@/lib/pi-permissions";
import { createProformaFromQuotation } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { convertQuotationToPiSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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

  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (!assertCompanyAccess(session.user.roles, userCompanyIds, companyId)) {
    return errorResponse("FORBIDDEN", "You do not have access to this company.", 403);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = convertQuotationToPiSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid conversion data.", 400, parsed.error.flatten());
  }

  try {
    const pi = await createProformaFromQuotation(prisma, {
      companyId,
      quotationId: id,
      warehouseId: parsed.data.warehouseId,
      createdById: session.user.id,
      issue: parsed.data.issue,
    });
    return NextResponse.json(pi, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Quotation not found.", 404);
      }
      if (error.message === "INVALID_QUOTATION_STATUS") {
        return errorResponse("INVALID_STATUS", "Only sent quotations can be converted.", 400);
      }
      if (error.message === "ALREADY_CONVERTED") {
        return errorResponse("ALREADY_CONVERTED", "Quotation already converted to PI.", 400);
      }
      if (error.message === "PRICE_APPROVAL_REQUIRED") {
        return errorResponse(
          "PRICE_APPROVAL_REQUIRED",
          "Quotation requires price approval before conversion.",
          400,
        );
      }
    }
    throw error;
  }
}
