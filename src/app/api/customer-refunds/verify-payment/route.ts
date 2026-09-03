import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  handleRefundRouteError,
  refundErrorResponse,
} from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canVerifyRefundPayment,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { verifyRefundPayment } from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { verifyRefundPaymentSchema } from "@/lib/validations";

/**
 * Verify an existing Bank Transaction Verification Code and return the received
 * payment context for a refund request. Read-only.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canVerifyRefundPayment(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = verifyRefundPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "Enter a firm and a verification code.",
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
    const verified = await verifyRefundPayment(prisma, {
      companyId: parsed.data.companyId,
      verificationCode: parsed.data.verificationCode,
    });
    return NextResponse.json(verified);
  } catch (error) {
    return handleRefundRouteError(error, "verifyRefundPayment");
  }
}
