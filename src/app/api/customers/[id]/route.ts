import { NextResponse } from "next/server";
import { CustomerStatus, CustomerType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  assertCompanyAccess,
  canEditCustomers,
  canEditIncentiveCredit,
  canViewCustomers,
} from "@/lib/customer-permissions";
import { getCustomerById, updateCustomer } from "@/lib/customer-service";
import { getBusinessMonthRange } from "@/lib/business-dates";
import { recalculateExecutiveModuleMastery } from "@/lib/module-mastery-service";
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
  if (!session?.user) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const body = await request.json();
  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid customer data.", 400, parsed.error.flatten());
  }

  const isIncentiveOnlyUpdate =
    parsed.data.incentiveCreditPercent !== undefined &&
    Object.keys(parsed.data).every((key) => key === "incentiveCreditPercent");

  if (isIncentiveOnlyUpdate) {
    if (!canEditIncentiveCredit(session.user.roles)) {
      return errorResponse(
        "FORBIDDEN",
        "Only Sales Managers and Super Admins can edit incentive credit %.",
        403,
      );
    }
  } else if (!canEditCustomers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  if (
    parsed.data.incentiveCreditPercent !== undefined &&
    !canEditIncentiveCredit(session.user.roles)
  ) {
    return errorResponse(
      "FORBIDDEN",
      "Only Sales Managers and Super Admins can edit incentive credit %.",
      403,
    );
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

  try {
    const customer = await updateCustomer(prisma, id, {
      updatedById: session.user.id,
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
      incentiveCreditPercent: parsed.data.incentiveCreditPercent,
    });

    if (
      parsed.data.incentiveCreditPercent !== undefined &&
      Number(existing.incentiveCreditPercent) !== parsed.data.incentiveCreditPercent
    ) {
      const { year, month } = getBusinessMonthRange();
      const companyIds = [...new Set(session.user.companies.map((company) => company.id))];
      const affected = await prisma.dispatch.findMany({
        where: {
          customerId: id,
          status: "DISPATCHED",
          companyId: { in: companyIds },
        },
        select: {
          companyId: true,
          proformaInvoice: { select: { salesUserId: true } },
        },
      });
      const jobs = new Map<string, { companyId: string; executiveId: string }>();
      for (const row of affected) {
        const key = `${row.companyId}:${row.proformaInvoice.salesUserId}`;
        jobs.set(key, {
          companyId: row.companyId,
          executiveId: row.proformaInvoice.salesUserId,
        });
      }
      for (const cid of companyIds) {
        jobs.set(`${cid}:${existing.assignedSalesUserId}`, {
          companyId: cid,
          executiveId: existing.assignedSalesUserId,
        });
      }
      await Promise.all(
        [...jobs.values()].map((job) =>
          recalculateExecutiveModuleMastery(prisma, {
            companyId: job.companyId,
            executiveId: job.executiveId,
            year,
            month,
          }),
        ),
      );
    }

    await writeAuditLog({
      tableName: "customers",
      recordId: customer.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId,
      oldValue: existing,
      newValue: customer,
    });

    const serialized = await getCustomerById(prisma, companyId, customer.id);
    return NextResponse.json(serialized);
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
