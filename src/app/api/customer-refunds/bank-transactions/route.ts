import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refundErrorResponse } from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canAccessRefundsModule,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { searchRefundBankTransactions } from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { refundBankTransactionSearchSchema } from "@/lib/validations";

/**
 * Look up existing credit receipts of a firm so they can be attached as extra
 * orders on a combined refund. Read-only.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canAccessRefundsModule(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = refundBankTransactionSearchSchema.safeParse({
    companyId: searchParams.get("companyId") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    excludeBankTransactionId: searchParams.get("excludeBankTransactionId") ?? undefined,
  });
  if (!parsed.success) {
    return refundErrorResponse(
      "VALIDATION_ERROR",
      "Invalid search.",
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

  const items = await searchRefundBankTransactions(prisma, {
    companyId: parsed.data.companyId,
    search: parsed.data.q,
    limit: parsed.data.limit,
    excludeBankTransactionIds: parsed.data.excludeBankTransactionId
      ? [parsed.data.excludeBankTransactionId]
      : [],
  });

  return NextResponse.json({ items });
}
