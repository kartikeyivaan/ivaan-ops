import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  assertCompanyAccess,
  canReassignCustomers,
} from "@/lib/customer-permissions";
import { reassignCustomers } from "@/lib/customer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { customerReassignSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canReassignCustomers(session.user.roles)) {
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
  const parsed = customerReassignSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid reassignment data.", 400, parsed.error.flatten());
  }

  const assignee = await prisma.user.findFirst({
    where: {
      id: parsed.data.assignedSalesUserId,
      status: "ACTIVE",
      companies: { some: { companyId } },
    },
  });
  if (!assignee) {
    return errorResponse("NOT_FOUND", "Assigned sales user not found for this company.", 404);
  }

  const count = await reassignCustomers(
    prisma,
    companyId,
    parsed.data.customerIds,
    parsed.data.assignedSalesUserId,
  );

  await writeAuditLog({
    tableName: "customers",
    recordId: parsed.data.customerIds[0],
    action: "UPDATE",
    performedBy: session.user.id,
    companyId,
    reference: "bulk_reassign",
    newValue: {
      customerIds: parsed.data.customerIds,
      assignedSalesUserId: parsed.data.assignedSalesUserId,
      updatedCount: count,
    },
  });

  return NextResponse.json({ updatedCount: count });
}
