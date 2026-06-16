import { NextResponse } from "next/server";
import { CustomerStatus, CustomerType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  assertCompanyAccess,
  canEditCustomers,
  canViewCustomers,
} from "@/lib/customer-permissions";
import { createCustomer, listCustomers } from "@/lib/customer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { customerSchema, customerSearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewCustomers(session.user.roles)) {
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

  const { searchParams } = new URL(request.url);
  const parsed = customerSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    customerType: searchParams.get("customerType") ?? undefined,
    assignedSalesUserId: searchParams.get("assignedSalesUserId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid search filters.", 400, parsed.error.flatten());
  }

  const customers = await listCustomers(prisma, companyId, {
    q: parsed.data.q,
    city: parsed.data.city,
    customerType: parsed.data.customerType as CustomerType | undefined,
    assignedSalesUserId: parsed.data.assignedSalesUserId,
    status: parsed.data.status as CustomerStatus | undefined,
  });

  return NextResponse.json(customers);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canEditCustomers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid customer data.", 400, parsed.error.flatten());
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return errorResponse("NOT_FOUND", "Company not found.", 404);
  }

  try {
    const customer = await createCustomer(prisma, {
      companyId,
      companyCode: company.code,
      createdById: session.user.id,
      customerName: parsed.data.customerName,
      contactPersonName: parsed.data.contactPersonName,
      customerType: parsed.data.customerType as CustomerType,
      gstNumber: parsed.data.gstNumber,
      address: parsed.data.address,
      city: parsed.data.city,
      state: parsed.data.state,
      pinCode: parsed.data.pinCode,
      mobile: parsed.data.mobile,
      email: parsed.data.email,
      assignedSalesUserId: parsed.data.assignedSalesUserId,
      status: parsed.data.status as CustomerStatus,
      contacts: parsed.data.contacts,
    });

    await writeAuditLog({
      tableName: "customers",
      recordId: customer.id,
      action: "CREATE",
      performedBy: session.user.id,
      companyId,
      newValue: {
        customerCode: customer.customerCode,
        customerName: customer.customerName,
        gstNumber: customer.gstNumber,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "DUPLICATE_GST") {
        return errorResponse(
          "DUPLICATE_GST",
          "Customer with this GST already exists.",
          409,
        );
      }
      if (error.message === "INVALID_GST") {
        return errorResponse("INVALID_GST", "GST number format is invalid.", 400);
      }
    }
    throw error;
  }
}
