import { NextResponse } from "next/server";
import { CustomerStatus, CustomerType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  assertCompanyAccess,
  canEditCustomers,
  canViewCustomers,
} from "@/lib/customer-permissions";
import { getCustomerById, updateCustomer } from "@/lib/customer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { customerUpdateSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  const customer = await getCustomerById(prisma, companyId, id);
  if (!customer) {
    return errorResponse("NOT_FOUND", "Customer not found.", 404);
  }

  return NextResponse.json(customer);
}

export async function PATCH(request: Request, context: RouteContext) {
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

  if (
    !assertCompanyAccess(
      session.user.roles,
      session.user.companies.map((c) => c.id),
      companyId,
    )
  ) {
    return errorResponse("COMPANY_ACCESS_DENIED", "You cannot access this company data.", 403);
  }

  const { id } = await context.params;
  const existing = await prisma.customer.findUnique({
    where: { id },
  });
  if (!existing) {
    return errorResponse("NOT_FOUND", "Customer not found.", 404);
  }

  const body = await request.json();
  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid customer data.", 400, parsed.error.flatten());
  }

  try {
    const customer = await updateCustomer(prisma, id, {
      customerName: parsed.data.customerName,
      contactPersonName: parsed.data.contactPersonName,
      customerType: parsed.data.customerType as CustomerType | undefined,
      gstNumber: parsed.data.gstNumber,
      address: parsed.data.address,
      city: parsed.data.city,
      state: parsed.data.state,
      pinCode: parsed.data.pinCode,
      mobile: parsed.data.mobile,
      email: parsed.data.email,
      assignedSalesUserId: parsed.data.assignedSalesUserId,
      status: parsed.data.status as CustomerStatus | undefined,
      contacts: parsed.data.contacts,
    });

    await writeAuditLog({
      tableName: "customers",
      recordId: customer.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId,
      oldValue: existing,
      newValue: customer,
    });

    return NextResponse.json(customer);
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
