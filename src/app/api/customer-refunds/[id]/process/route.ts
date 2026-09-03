import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  handleRefundRouteError,
  refundErrorResponse,
} from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canProcessRefund,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import {
  getCustomerRefund,
  processCustomerRefund,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { processCustomerRefundSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

/** Record the executed transfer and mark the refund as Refunded. */
export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canProcessRefund(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission to process refunds.",
      403,
    );
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  const { id } = await context.params;
  const existing = await getCustomerRefund(prisma, id);
  if (!existing || !canAccessRefundCompany(companyIds, existing.companyId)) {
    return refundErrorResponse("NOT_FOUND", "Refund not found.", 404);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = processCustomerRefundSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "Invalid refund transaction details.",
      400,
      parsed.error.flatten(),
    );
  }

  const refundDate = new Date(parsed.data.refundDate);
  if (Number.isNaN(refundDate.getTime())) {
    return refundErrorResponse("VALIDATION_ERROR", "Enter a valid refund date.", 400);
  }

  try {
    const updated = await processCustomerRefund(prisma, {
      id,
      refundDate,
      actualRefundAmount: parsed.data.actualRefundAmount,
      refundPaymentMode: parsed.data.refundPaymentMode,
      refundFromBankAccountId: parsed.data.refundFromBankAccountId,
      utrNumber: parsed.data.utrNumber,
      remarks: parsed.data.remarks ?? null,
      actorUserId: session.user.id,
      actorRoles: session.user.roles,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRefundRouteError(error, "processCustomerRefund");
  }
}
