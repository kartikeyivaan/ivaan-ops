import { NextResponse } from "next/server";
import { BankTransactionIssueStatus, BankTransactionIssueType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { listReconciliationIssues } from "@/lib/bank-reconciliation-service";
import { canManageReconciliation } from "@/lib/banking-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageReconciliation(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const companyId = requireActiveCompany(session);
  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  const typeParam = params.get("issueType");
  const bankAccountId = params.get("bankAccountId")?.trim() || undefined;

  const status =
    statusParam && Object.values(BankTransactionIssueStatus).includes(statusParam as BankTransactionIssueStatus)
      ? (statusParam as BankTransactionIssueStatus)
      : undefined;
  const issueType =
    typeParam && Object.values(BankTransactionIssueType).includes(typeParam as BankTransactionIssueType)
      ? (typeParam as BankTransactionIssueType)
      : undefined;

  const rows = await listReconciliationIssues(prisma, {
    companyId,
    status,
    issueType,
    bankAccountId,
  });

  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      issueType: row.issueType,
      status: row.status,
      existingValues: row.existingValues,
      uploadedValues: row.uploadedValues,
      details: row.details,
      resolutionReason: row.resolutionReason,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      ignoredAt: row.ignoredAt?.toISOString() ?? null,
      bankAccount: row.bankAccount
        ? {
            id: row.bankAccount.id,
            bankName: row.bankAccount.bankName,
            accountNumberMasked: row.bankAccount.accountNumberMasked,
            company: row.bankAccount.company,
          }
        : null,
      bankTransaction: row.bankTransaction
        ? {
            id: row.bankTransaction.id,
            transactionDate: row.bankTransaction.transactionDate.toISOString().slice(0, 10),
            description: row.bankTransaction.description,
            referenceNumber: row.bankTransaction.referenceNumber,
            debitAmount: Number(row.bankTransaction.debitAmount),
            creditAmount: Number(row.bankTransaction.creditAmount),
            runningBalance: Number(row.bankTransaction.runningBalance),
          }
        : null,
    })),
  });
}
