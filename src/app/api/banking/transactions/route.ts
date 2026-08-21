import { NextResponse } from "next/server";
import { BankTransactionAssignmentStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { listBankAccounts, serializeBankAccount } from "@/lib/bank-account-service";
import { listBankTransactions } from "@/lib/banking-query-service";
import { canViewFullBankTransactions } from "@/lib/banking-permissions";
import { defaultPaymentsDateRange } from "@/lib/proforma-invoices";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewFullBankTransactions(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const companyId = requireActiveCompany(session);
  const params = new URL(request.url).searchParams;
  const defaults = defaultPaymentsDateRange();

  const assignmentRaw = params.get("assignmentStatus");
  const assignmentStatus =
    assignmentRaw &&
    Object.values(BankTransactionAssignmentStatus).includes(
      assignmentRaw as BankTransactionAssignmentStatus,
    )
      ? (assignmentRaw as BankTransactionAssignmentStatus)
      : undefined;

  const directionRaw = params.get("direction");
  const direction =
    directionRaw === "CREDIT" || directionRaw === "DEBIT" || directionRaw === "ALL"
      ? directionRaw
      : "ALL";

  const reconRaw = params.get("reconciliationStatus");
  const reconciliationStatus =
    reconRaw === "OK" || reconRaw === "ISSUE" || reconRaw === "ALL" ? reconRaw : "ALL";

  const receivedRaw = params.get("receivedInAccount");
  const receivedInAccount =
    receivedRaw === "SBI" || receivedRaw === "HDFC" || receivedRaw === "ICICI"
      ? receivedRaw
      : undefined;

  const minAmount = params.get("minAmount");
  const maxAmount = params.get("maxAmount");

  const [items, accounts] = await Promise.all([
    listBankTransactions(prisma, companyId, {
      q: params.get("q")?.trim() || undefined,
      dateFrom: params.get("dateFrom")?.trim() || defaults.dateFrom,
      dateTo: params.get("dateTo")?.trim() || defaults.dateTo,
      bankAccountId: params.get("bankAccountId")?.trim() || undefined,
      receivedInAccount,
      direction,
      assignmentStatus,
      reconciliationStatus,
      importId: params.get("importId")?.trim() || undefined,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
    }),
    listBankAccounts(prisma, companyId, { includeInactive: false }),
  ]);

  return NextResponse.json({
    items,
    accounts: accounts.map(serializeBankAccount),
    dateFrom: params.get("dateFrom")?.trim() || defaults.dateFrom,
    dateTo: params.get("dateTo")?.trim() || defaults.dateTo,
  });
}
