import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  handleRefundRouteError,
  refundErrorResponse,
} from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canAccessRefundsModule,
  canCancelRefund,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import {
  cancelCustomerRefund,
  getCustomerRefund,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { cancelCustomerRefundSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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
    !canCancelRefund(session.user.roles, existing.requestedById, session.user.id)
  ) {
    return refundErrorResponse(
      "FORBIDDEN",
      "Only the requester can cancel this refund request.",
      403,
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = cancelCustomerRefundSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "Invalid cancellation data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const updated = await cancelCustomerRefund(prisma, {
      id,
      reason: parsed.data.reason ?? null,
      actorUserId: session.user.id,
      actorRoles: session.user.roles,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRefundRouteError(error, "cancelCustomerRefund");
  }
}
