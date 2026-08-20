import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import {
  canApprovePiEdit,
  canManageProformaInvoices,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
import { getProformaInvoiceById, requestProformaInvoiceEdit } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { updateProformaInvoiceSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
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

export async function PATCH(request: Request, context: RouteContext) {
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

  const body = await request.json();
  const parsed = updateProformaInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid proforma invoice data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;
  const applyImmediately = canApprovePiEdit(session.user.roles);

  try {
    const result = await requestProformaInvoiceEdit(prisma, {
      companyId,
      piId: id,
      requestedById: session.user.id,
      notes: parsed.data.notes,
      issue: parsed.data.issue,
      lines: parsed.data.lines,
      applyImmediately,
    });
    return NextResponse.json(result.pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "LINES_REQUIRED") {
        return errorResponse("VALIDATION_ERROR", "Add at least one line item.", 400);
      }
      if (error.message === "NO_CHANGES") {
        return errorResponse("NO_CHANGES", "No changes were detected in this edit.", 400);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse(
          "INVALID_STATUS",
          applyImmediately
            ? "This PI can no longer be edited. Unbook it first if it is still booked."
            : "This PI can no longer be edited, or an edit is already pending approval.",
          400,
        );
      }
    }
    throw error;
  }
}
