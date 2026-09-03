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
  markCustomerRefundFailed,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { markCustomerRefundFailedSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

/** Record a failed transfer attempt. The refund stays retryable. */
export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canProcessRefund(session.user.roles)) {
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

  const body = await request.json().catch(() => ({}));
  const parsed = markCustomerRefundFailedSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "A failure reason is required.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const updated = await markCustomerRefundFailed(prisma, {
      id,
      failureReason: parsed.data.failureReason,
      actorUserId: session.user.id,
      actorRoles: session.user.roles,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRefundRouteError(error, "markCustomerRefundFailed");
  }
}
