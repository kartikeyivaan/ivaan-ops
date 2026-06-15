import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  assertCompanyAccess,
  canImportCustomers,
} from "@/lib/customer-permissions";
import { importCustomers, previewCustomerImport } from "@/lib/customer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { customerImportSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canImportCustomers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  if (
    !assertCompanyAccess(
      session.user.roles,
      session.user.companies.map((c) => c.id),
      companyId,
    )
  ) {
    return errorResponse("COMPANY_ACCESS_DENIED", "You cannot access this company data.", 403);
  }

  const body = await request.json();
  const parsed = customerImportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid import payload.", 400, parsed.error.flatten());
  }

  if (parsed.data.mode === "preview") {
    const preview = await previewCustomerImport(prisma, companyId, parsed.data.rows);
    return NextResponse.json({
      rows: preview,
      validCount: preview.filter((row) => row.isValid).length,
      invalidCount: preview.filter((row) => !row.isValid).length,
    });
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return errorResponse("NOT_FOUND", "Company not found.", 404);
  }

  try {
    const result = await importCustomers(
      prisma,
      companyId,
      company.code,
      session.user.id,
      parsed.data.rows,
    );

    for (const customer of result.customers) {
      await writeAuditLog({
        tableName: "customers",
        recordId: customer.id,
        action: "CREATE",
        performedBy: session.user.id,
        companyId,
        reference: "excel_import",
        newValue: {
          customerCode: customer.customerCode,
          customerName: customer.customerName,
          gstNumber: customer.gstNumber,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_VALID_ROWS") {
      return errorResponse("NO_VALID_ROWS", "No valid rows to import.", 400);
    }
    throw error;
  }
}
