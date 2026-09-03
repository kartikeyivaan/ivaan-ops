import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refundErrorResponse } from "@/lib/customer-refund-api";
import {
  canAccessRefundCompany,
  canAccessRefundsModule,
  getAccessibleRefundCompanyIds,
} from "@/lib/customer-refund-permissions";
import { searchRefundBankTransactions } from "@/lib/customer-refund-service";
import { decimalToNumber } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { refundBankTransactionSearchSchema } from "@/lib/validations";

/**
 * Look up existing bank transactions of a firm so they can be attached as
 * refund references. Read-only — the refund flow never writes to this table.
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

  const rows = await searchRefundBankTransactions(prisma, {
    companyId: parsed.data.companyId,
    search: parsed.data.q,
    limit: parsed.data.limit,
  });

  return NextResponse.json({
    items: rows.map((row) => {
      const credit = decimalToNumber(row.creditAmount);
      const debit = decimalToNumber(row.debitAmount);
      return {
        id: row.id,
        bankName: row.bankAccount.bankName,
        bankAccountMasked: row.bankAccount.accountNumberMasked,
        transactionReference: row.referenceNumber,
        transactionDate: row.transactionDate.toISOString().slice(0, 10),
        description: row.description,
        amount: credit > 0 ? credit : debit,
        isCredit: credit > 0,
      };
    }),
  });
}
