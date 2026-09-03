import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  handleRefundRouteError,
  refundErrorResponse,
} from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canAccessRefundsModule,
  canEditRefundDraft,
  canViewAllRefunds,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import {
  getCustomerRefund,
  getCustomerRefundActivity,
  updateCustomerRefundDraft,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { updateCustomerRefundSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAccessRefundsModule(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const { id } = await context.params;
  const refund = await getCustomerRefund(prisma, id);

  if (!refund || !canAccessRefundCompany(companyIds, refund.companyId)) {
    return refundErrorResponse("NOT_FOUND", "Refund not found.", 404);
  }
  if (
    !canViewAllRefunds(session.user.roles) &&
    refund.requestedById !== session.user.id
  ) {
    return refundErrorResponse("NOT_FOUND", "Refund not found.", 404);
  }

  const activity = await getCustomerRefundActivity(prisma, refund.id);
  return NextResponse.json({ refund, activity });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAccessRefundsModule(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const { id } = await context.params;
  const existing = await getCustomerRefund(prisma, id);
  if (!existing || !canAccessRefundCompany(companyIds, existing.companyId)) {
    return refundErrorResponse("NOT_FOUND", "Refund not found.", 404);
  }

  if (
    !canEditRefundDraft(session.user.roles, existing.requestedById, session.user.id)
  ) {
    return refundErrorResponse(
      "FORBIDDEN",
      "Only the requester can edit this refund request.",
      403,
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateCustomerRefundSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "Invalid refund data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const updated = await updateCustomerRefundDraft(prisma, {
      id,
      piNumber: parsed.data.piNumber,
      requestedAmount: parsed.data.requestedAmount,
      reason: parsed.data.reason,
      remarks: parsed.data.remarks,
      bankTransactionIds: parsed.data.bankTransactionIds,
      refundBankAccount: parsed.data.refundBankAccount,
      actorUserId: session.user.id,
      actorRoles: session.user.roles,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRefundRouteError(error, "updateCustomerRefundDraft");
  }
}
