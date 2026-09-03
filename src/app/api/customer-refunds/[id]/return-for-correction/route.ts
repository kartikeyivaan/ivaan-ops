import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  handleRefundRouteError,
  refundErrorResponse,
} from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canReturnRefundForCorrection,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import {
  getCustomerRefund,
  returnCustomerRefundForCorrection,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { returnCustomerRefundSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Controlled correction path for an approved refund. Clears the approval so the
 * locked fields become editable again and forces re-approval.
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canReturnRefundForCorrection(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission to return refunds for correction.",
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
  const parsed = returnCustomerRefundSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "A correction reason is required.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const updated = await returnCustomerRefundForCorrection(prisma, {
      id,
      reason: parsed.data.reason,
      actorUserId: session.user.id,
      actorRoles: session.user.roles,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRefundRouteError(error, "returnCustomerRefundForCorrection");
  }
}
