import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  handleRefundRouteError,
  refundErrorResponse,
} from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canAccessRefundsModule,
  canRequestRefund,
  canViewAllRefunds,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import {
  createCustomerRefund,
  listCustomerRefunds,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import {
  createCustomerRefundSchema,
  customerRefundSearchSchema,
} from "@/lib/validations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canAccessRefundsModule(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  if (!companyIds.length) {
    return refundErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const parsed = customerRefundSearchSchema.safeParse({
    companyId: searchParams.get("companyId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    customerId: searchParams.get("customerId") ?? undefined,
    requestedById: searchParams.get("requestedById") ?? undefined,
    approvedById: searchParams.get("approvedById") ?? undefined,
    reason: searchParams.get("reason") ?? undefined,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "Invalid filters.",
      400,
      parsed.error.flatten(),
    );
  }

  if (parsed.data.companyId && !canAccessRefundCompany(companyIds, parsed.data.companyId)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have access to the selected firm.",
      403,
    );
  }

  const refunds = await listCustomerRefunds(prisma, {
    companyIds,
    companyId: parsed.data.companyId,
    status: parsed.data.status,
    customerId: parsed.data.customerId,
    requestedById: parsed.data.requestedById,
    approvedById: parsed.data.approvedById,
    reason: parsed.data.reason,
    fromDate: parsed.data.fromDate ? new Date(parsed.data.fromDate) : undefined,
    toDate: parsed.data.toDate ? new Date(parsed.data.toDate) : undefined,
    search: parsed.data.q,
    // Sales Executives only ever see their own requests.
    ownRequestsOnlyForUserId: canViewAllRefunds(session.user.roles)
      ? undefined
      : session.user.id,
  });

  return NextResponse.json({ items: refunds });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canRequestRefund(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createCustomerRefundSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "Invalid refund request data.",
      400,
      parsed.error.flatten(),
    );
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  if (!canAccessRefundCompany(companyIds, parsed.data.companyId)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have access to the selected firm.",
      403,
    );
  }

  try {
    const created = await createCustomerRefund(prisma, {
      companyId: parsed.data.companyId,
      verificationCode: parsed.data.verificationCode,
      customerId: parsed.data.customerId ?? null,
      piNumber: parsed.data.piNumber ?? null,
      requestedAmount: parsed.data.requestedAmount,
      reason: parsed.data.reason,
      remarks: parsed.data.remarks ?? null,
      bankTransactionIds: parsed.data.bankTransactionIds,
      refundBankAccount: parsed.data.refundBankAccount,
      submit: parsed.data.submit,
      actorUserId: session.user.id,
      actorRoles: session.user.roles,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRefundRouteError(error, "createCustomerRefund");
  }
}
