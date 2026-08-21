import {
  BankTransactionIssueStatus,
  BankTransactionIssueType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  BANKING_AUDIT_EVENTS,
  writeBankingAudit,
} from "@/lib/banking-audit";
import {
  buildExistingDataMismatchFinding,
  reconcileLedgerAfterImport,
  type ExistingDataMismatchInput,
  type LedgerTxn,
  type ReconciliationFinding,
} from "@/lib/bank-reconciliation-engine";

type Db = PrismaClient | Prisma.TransactionClient;

function toIssueType(type: ReconciliationFinding["type"]): BankTransactionIssueType {
  switch (type) {
    case "EXISTING_DATA_MISMATCH":
      return BankTransactionIssueType.EXISTING_DATA_MISMATCH;
    case "BALANCE_CONTINUITY_MISMATCH":
      return BankTransactionIssueType.BALANCE_CONTINUITY_MISMATCH;
    case "POSSIBLE_MISSING_TRANSACTION":
      return BankTransactionIssueType.POSSIBLE_MISSING_TRANSACTION;
    case "SEQUENCE_GAP":
      return BankTransactionIssueType.SEQUENCE_GAP;
  }
}

export async function loadLedgerForAccount(
  db: Db,
  bankAccountId: string,
): Promise<LedgerTxn[]> {
  const rows = await db.bankTransaction.findMany({
    where: { bankAccountId },
    select: {
      id: true,
      sourceImportId: true,
      transactionDate: true,
      debitAmount: true,
      creditAmount: true,
      runningBalance: true,
      statementSequence: true,
      referenceNumber: true,
      description: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    sourceImportId: row.sourceImportId,
    transactionDate: row.transactionDate,
    debitAmount: Number(row.debitAmount),
    creditAmount: Number(row.creditAmount),
    runningBalance: Number(row.runningBalance),
    statementSequence: row.statementSequence,
    referenceNumber: row.referenceNumber,
    description: row.description,
  }));
}

export async function persistReconciliationFindings(
  db: Db,
  input: {
    bankAccountId: string;
    sourceImportId: string | null;
    findings: ReconciliationFinding[];
  },
) {
  let created = 0;
  for (const finding of input.findings) {
    await db.bankTransactionIssue.create({
      data: {
        bankAccountId: input.bankAccountId,
        bankTransactionId: finding.bankTransactionId,
        sourceImportId: input.sourceImportId,
        issueType: toIssueType(finding.type),
        status: BankTransactionIssueStatus.OPEN,
        existingValues: finding.existingValues
          ? (finding.existingValues as Prisma.InputJsonValue)
          : undefined,
        uploadedValues: finding.uploadedValues
          ? (finding.uploadedValues as Prisma.InputJsonValue)
          : undefined,
        details: {
          message: finding.message,
          expectedBalance: finding.expectedBalance ?? null,
          actualBalance: finding.actualBalance ?? null,
          previousTransactionId: finding.previousTransactionId,
          ...(finding.details ?? {}),
        } as Prisma.InputJsonValue,
      },
    });
    created += 1;
  }
  return created;
}

/**
 * After import confirm: ledger continuity + boundary gap issues.
 * Does not modify or invent bank_transactions.
 */
export async function runPostImportReconciliation(
  db: Db,
  input: {
    bankAccountId: string;
    importId: string;
  },
) {
  const ledger = await loadLedgerForAccount(db, input.bankAccountId);
  const findings = reconcileLedgerAfterImport(ledger, input.importId);
  const created = await persistReconciliationFindings(db, {
    bankAccountId: input.bankAccountId,
    sourceImportId: input.importId,
    findings,
  });
  return { findings, created };
}

export async function recordExistingDataMismatches(
  db: Db,
  input: {
    bankAccountId: string;
    sourceImportId: string;
    mismatches: ExistingDataMismatchInput[];
  },
) {
  const findings = input.mismatches.map(buildExistingDataMismatchFinding);
  return persistReconciliationFindings(db, {
    bankAccountId: input.bankAccountId,
    sourceImportId: input.sourceImportId,
    findings,
  });
}

export type ListReconciliationIssuesFilters = {
  companyId: string;
  status?: BankTransactionIssueStatus;
  issueType?: BankTransactionIssueType;
  bankAccountId?: string;
};

export async function listReconciliationIssues(
  db: PrismaClient,
  filters: ListReconciliationIssuesFilters,
) {
  const accounts = await db.bankAccount.findMany({
    where: {
      companyId: filters.companyId,
      ...(filters.bankAccountId ? { id: filters.bankAccountId } : {}),
    },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) return [];

  return db.bankTransactionIssue.findMany({
    where: {
      bankAccountId: { in: accountIds },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.issueType ? { issueType: filters.issueType } : {}),
    },
    include: {
      bankAccount: {
        select: {
          id: true,
          bankName: true,
          accountNumberMasked: true,
          company: { select: { id: true, code: true, name: true } },
        },
      },
      bankTransaction: {
        select: {
          id: true,
          transactionDate: true,
          description: true,
          referenceNumber: true,
          debitAmount: true,
          creditAmount: true,
          runningBalance: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
}

export async function setReconciliationIssueStatus(
  db: PrismaClient,
  input: {
    issueId: string;
    companyId: string;
    actorUserId: string;
    status: BankTransactionIssueStatus;
    reason?: string | null;
  },
) {
  const issue = await db.bankTransactionIssue.findUnique({
    where: { id: input.issueId },
    include: { bankAccount: { select: { companyId: true } } },
  });
  if (!issue) throw new Error("NOT_FOUND");
  if (issue.bankAccount && issue.bankAccount.companyId !== input.companyId) {
    throw new Error("FORBIDDEN_COMPANY");
  }

  if (input.status === BankTransactionIssueStatus.IGNORED) {
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 3) throw new Error("REASON_REQUIRED");
  }

  if (input.status === BankTransactionIssueStatus.RESOLVED) {
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 3) throw new Error("REASON_REQUIRED");
  }

  const updated = await db.bankTransactionIssue.update({
    where: { id: input.issueId },
    data: {
      status: input.status,
      resolutionReason: input.reason?.trim() || null,
      ...(input.status === BankTransactionIssueStatus.RESOLVED
        ? { resolvedById: input.actorUserId, resolvedAt: new Date(), ignoredById: null, ignoredAt: null }
        : {}),
      ...(input.status === BankTransactionIssueStatus.IGNORED
        ? { ignoredById: input.actorUserId, ignoredAt: new Date(), resolvedById: null, resolvedAt: null }
        : {}),
      ...(input.status === BankTransactionIssueStatus.UNDER_REVIEW ||
      input.status === BankTransactionIssueStatus.OPEN
        ? {
            resolvedById: null,
            resolvedAt: null,
            ignoredById: null,
            ignoredAt: null,
          }
        : {}),
    },
  });

  await writeBankingAudit({
    eventType: BANKING_AUDIT_EVENTS.RECONCILIATION_STATUS,
    tableName: "bank_transaction_issues",
    recordId: updated.id,
    action: "UPDATE",
    performedBy: input.actorUserId,
    companyId: input.companyId,
    oldValue: { status: issue.status },
    newValue: { status: updated.status, resolutionReason: updated.resolutionReason },
    reason: input.reason?.trim() || `Status → ${input.status}`,
  });

  return updated;
}
