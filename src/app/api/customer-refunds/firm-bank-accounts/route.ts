import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refundErrorResponse } from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canProcessRefund,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { listFirmRefundBankAccounts } from "@/lib/customer-refund-service";
import { prisma } from "@/lib/prisma";

/**
 * Firm payout accounts (existing BankAccount master), most-recently-used for
 * refunds first. Scoped to a single firm so an Ivaan Solar Energy account can
 * never be offered for a PCM Ventures refund.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canProcessRefund(session.user.roles)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) {
    return refundErrorResponse("COMPANY_REQUIRED", "A firm is required.", 400);
  }

  const companyIds = await getAccessibleRefundCompanyIds(prisma, session);
  if (!canAccessRefundCompany(companyIds, companyId)) {
    return refundErrorResponse(
      "FORBIDDEN",
      "You do not have access to the selected firm.",
      403,
    );
  }

  const accounts = await listFirmRefundBankAccounts(prisma, companyId);
  return NextResponse.json({ items: accounts });
}
