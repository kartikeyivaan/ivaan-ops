import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import {
  canManageProformaInvoices,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
import { createProformaInvoice, listProformaInvoices } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import {
  createProformaInvoiceSchema,
  proformaInvoiceSearchSchema,
} from "@/lib/validations";
import {
  FIRM_SALES_SCOPE,
  isFirmSalesScope,
  restrictSalesUserId,
} from "@/lib/report-permissions";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const rawSalesUserId = searchParams.get("salesUserId");
  const firmWideRequested = isFirmSalesScope(rawSalesUserId);
  const parsed = proformaInvoiceSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    customerId: searchParams.get("customerId") ?? undefined,
    salesUserId:
      rawSalesUserId && !firmWideRequested ? rawSalesUserId : undefined,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
    outstandingOnly: searchParams.get("outstandingOnly") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const salesUserId = restrictSalesUserId(
    session.user.roles,
    session.user.id,
    firmWideRequested ? FIRM_SALES_SCOPE : parsed.data.salesUserId,
  );

  const rows = await listProformaInvoices(prisma, companyId, {
    ...parsed.data,
    salesUserId,
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const parsed = createProformaInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid proforma invoice data.",
      400,
      parsed.error.flatten(),
    );
  }

  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (!assertCompanyAccess(session.user.roles, userCompanyIds, companyId)) {
    return errorResponse("FORBIDDEN", "You do not have access to this company.", 403);
  }

  const salesUserId = restrictSalesUserId(
    session.user.roles,
    session.user.id,
    parsed.data.salesUserId ??
      (session.user.roles.includes(ROLES.SALES_EXECUTIVE) ? session.user.id : undefined),
  );

  if (!salesUserId) {
    return errorResponse("VALIDATION_ERROR", "Sales executive is required.", 400);
  }

  try {
    const pi = await createProformaInvoice(prisma, {
      companyId,
      customerId: parsed.data.customerId,
      salesUserId,
      warehouseId: parsed.data.warehouseId,
      createdById: session.user.id,
      notes: parsed.data.notes,
      issue: parsed.data.issue,
      lines: parsed.data.lines,
    });

    return NextResponse.json(pi, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CUSTOMER_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Customer not found.", 404);
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "LINES_REQUIRED") {
        return errorResponse("VALIDATION_ERROR", "Add at least one line item.", 400);
      }
    }
    throw error;
  }
}
