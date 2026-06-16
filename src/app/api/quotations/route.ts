import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import {
  canManageQuotations,
  canViewQuotations,
} from "@/lib/quotation-permissions";
import { createQuotation, listQuotations } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { createQuotationSchema, quotationSearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const parsed = quotationSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    customerId: searchParams.get("customerId") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const quotations = await listQuotations(prisma, companyId, parsed.data);
  return NextResponse.json(quotations);
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const parsed = createQuotationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid quotation data.",
      400,
      parsed.error.flatten(),
    );
  }

  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (!assertCompanyAccess(session.user.roles, userCompanyIds, companyId)) {
    return errorResponse("FORBIDDEN", "You do not have access to this company.", 403);
  }

  const salesUserId = parsed.data.salesUserId ?? session.user.id;

  if (!salesUserId) {
    return errorResponse("VALIDATION_ERROR", "Sales executive is required.", 400);
  }

  try {
    const quotation = await createQuotation(prisma, {
      companyId,
      customerId: parsed.data.customerId,
      salesUserId,
      createdById: session.user.id,
      notes: parsed.data.notes,
      send: parsed.data.send,
      lines: parsed.data.lines,
    });

    return NextResponse.json(quotation, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CUSTOMER_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Customer not found.", 404);
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "PRODUCT_PRICE_NOT_FOUND") {
        return errorResponse("VALIDATION_ERROR", "Product price not configured.", 400);
      }
      if (error.message === "PRICE_APPROVAL_REQUIRED") {
        return errorResponse(
          "PRICE_APPROVAL_REQUIRED",
          "Below-minimum pricing requires Sales Manager approval before sending.",
          400,
        );
      }
      if (error.message === "LINES_REQUIRED") {
        return errorResponse("VALIDATION_ERROR", "Add at least one line item.", 400);
      }
    }
    throw error;
  }
}
