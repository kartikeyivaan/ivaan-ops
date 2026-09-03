import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  handleRefundRouteError,
  refundErrorResponse,
} from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canApproveRefund,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import {
  getCustomerRefund,
  rejectCustomerRefund,
} from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { rejectCustomerRefundSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApproveRefund(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission to reject refunds.",
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
  const parsed = rejectCustomerRefundSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "A rejection reason is required.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const updated = await rejectCustomerRefund(prisma, {
      id,
      rejectionReason: parsed.data.rejectionReason,
      actorUserId: session.user.id,
      actorRoles: session.user.roles,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRefundRouteError(error, "rejectCustomerRefund");
  }
}
