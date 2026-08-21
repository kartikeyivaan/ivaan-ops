import {
  BankStatementImportStatus,
  BankStatementParserType,
  BankTransactionIssueType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  BANKING_AUDIT_EVENTS,
  writeBankingAudit,
  writeBankingAuditTx,
} from "@/lib/banking-audit";
import {
  analyzeIncomingTransactions,
  buildTransactionFingerprint,
  type AnalyzedIncomingTransaction,
  type BalanceSequenceIssue,
  type ExistingBankTransactionSnapshot,
  type ImportAnalysisSummary,
} from "@/lib/bank-import-analysis";
import {
  createBankStatementParser,
  detectBankStatementParserType,
} from "@/lib/bank-statement-parser";
import {
  deleteTempBankStatementFile,
  hashBankStatementFile,
  isAllowedBankStatementFilename,
  runWithTempBankStatementFile,
  writeTempBankStatementFile,
} from "@/lib/bank-statement-temp";
import {
  BankStatementParseError,
  type BankStatementParser,
  type NormalizedBankTransaction,
  type ParsedBankStatement,
} from "@/lib/bank-statement-types";
import {
  recordExistingDataMismatches,
  runPostImportReconciliation,
} from "@/lib/bank-reconciliation-service";
import { allocateUniquePaymentCode } from "@/lib/bank-payment-code";

type Db = PrismaClient;

export type ProcessBankStatementUploadInput = {
  originalFilename: string;
  contents: Buffer | Uint8Array;
  uploadedById: string;
  companyId: string;
  bankAccountId?: string | null;
};

export type ProcessBankStatementUploadOptions = {
  parser?: BankStatementParser;
  parserType?: BankStatementParserType;
};

export type ImportPreviewAccount = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  receivedInAccount: string;
};

export type ImportPreviewCompany = {
  id: string;
  code: string;
  name: string;
};

export type StoredImportAnalysisPayload = {
  company: ImportPreviewCompany;
  bankAccount: ImportPreviewAccount;
  statementPeriod: { start: string | null; end: string | null };
  parserType: BankStatementParserType;
  warnings: string[];
  summary: ImportAnalysisSummary;
  balanceIssues: BalanceSequenceIssue[];
  transactions: Array<{
    classification: AnalyzedIncomingTransaction["classification"];
    matchMethod: AnalyzedIncomingTransaction["matchMethod"];
    existingTransactionId: string | null;
    fingerprint: string;
    fieldDiffs: AnalyzedIncomingTransaction["fieldDiffs"];
    incoming: {
      transactionDate: string;
      valueDate: string | null;
      description: string;
      referenceNumber: string | null;
      debitAmount: number;
      creditAmount: number;
      runningBalance: number;
      statementSequence: number;
      sourceRowNumber: number | null;
    };
  }>;
};

export type BankStatementPreviewResult = {
  importId: string;
  processingStatus: BankStatementImportStatus;
  parserType: BankStatementParserType;
  bankAccountId: string | null;
  fileHash: string;
  fileDeleted: boolean;
  fileDeletedAt: string | null;
  transactionsDetected: number;
  newTransactions: number;
  duplicatesDetected: number;
  mismatchesDetected: number;
  balanceIssuesDetected: number;
  errorMessage: string | null;
  preview: StoredImportAnalysisPayload | null;
  tempPathWas: string;
};

function toDateOnlyIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function serializeIncoming(txn: NormalizedBankTransaction) {
  return {
    transactionDate: txn.transactionDate.toISOString().slice(0, 10),
    valueDate: toDateOnlyIso(txn.valueDate),
    description: txn.description,
    referenceNumber: txn.referenceNumber,
    debitAmount: txn.debitAmount,
    creditAmount: txn.creditAmount,
    runningBalance: txn.runningBalance,
    statementSequence: txn.statementSequence,
    sourceRowNumber: txn.sourceRowNumber,
  };
}

function deserializeIncoming(
  row: StoredImportAnalysisPayload["transactions"][number]["incoming"],
): NormalizedBankTransaction {
  return {
    transactionDate: new Date(`${row.transactionDate}T00:00:00.000Z`),
    valueDate: row.valueDate ? new Date(`${row.valueDate}T00:00:00.000Z`) : null,
    description: row.description,
    referenceNumber: row.referenceNumber,
    debitAmount: row.debitAmount,
    creditAmount: row.creditAmount,
    runningBalance: row.runningBalance,
    statementSequence: row.statementSequence,
    sourceRowNumber: row.sourceRowNumber,
  };
}

function buildStoredPayload(input: {
  company: ImportPreviewCompany;
  bankAccount: ImportPreviewAccount;
  parsed: ParsedBankStatement;
  analyzed: AnalyzedIncomingTransaction[];
  summary: ImportAnalysisSummary;
  balanceIssues: BalanceSequenceIssue[];
}): StoredImportAnalysisPayload {
  return {
    company: input.company,
    bankAccount: input.bankAccount,
    statementPeriod: {
      start: toDateOnlyIso(input.parsed.statementStartDate),
      end: toDateOnlyIso(input.parsed.statementEndDate),
    },
    parserType: input.parsed.parserType,
    warnings: input.parsed.warnings,
    summary: input.summary,
    balanceIssues: input.balanceIssues,
    transactions: input.analyzed.map((row) => ({
      classification: row.classification,
      matchMethod: row.matchMethod,
      existingTransactionId: row.existingTransactionId,
      fingerprint: row.fingerprint,
      fieldDiffs: row.fieldDiffs,
      incoming: serializeIncoming(row.incoming),
    })),
  };
}

async function resolveBankAccount(
  db: Db,
  companyId: string,
  parsed: ParsedBankStatement,
  explicitBankAccountId: string | null | undefined,
) {
  if (explicitBankAccountId) {
    return db.bankAccount.findFirst({
      where: { id: explicitBankAccountId, companyId, isActive: true },
      include: { company: { select: { id: true, code: true, name: true } } },
    });
  }

  const accountNumber = parsed.account.accountNumber?.replace(/\s+/g, "").trim();
  if (!accountNumber) return null;

  return db.bankAccount.findFirst({
    where: { companyId, isActive: true, accountNumber },
    include: { company: { select: { id: true, code: true, name: true } } },
  });
}

async function loadExistingSnapshots(
  db: Db,
  bankAccountId: string,
  parsed: ParsedBankStatement,
): Promise<ExistingBankTransactionSnapshot[]> {
  const refs = parsed.transactions
    .map((txn) => txn.referenceNumber?.trim())
    .filter((value): value is string => Boolean(value));

  const dates = parsed.transactions.map((txn) => txn.transactionDate);
  const minDate = dates.reduce((a, b) => (a < b ? a : b), dates[0]!);
  const maxDate = dates.reduce((a, b) => (a > b ? a : b), dates[0]!);

  const rows = await db.bankTransaction.findMany({
    where: {
      bankAccountId,
      OR: [
        ...(refs.length > 0 ? [{ referenceNumber: { in: refs } }] : []),
        {
          transactionDate: {
            gte: minDate,
            lte: maxDate,
          },
        },
      ],
    },
  });

  return rows.map((row) => ({
    id: row.id,
    transactionDate: row.transactionDate,
    valueDate: row.valueDate,
    description: row.description,
    referenceNumber: row.referenceNumber,
    debitAmount: Number(row.debitAmount),
    creditAmount: Number(row.creditAmount),
    runningBalance: Number(row.runningBalance),
    statementSequence: row.statementSequence,
    transactionFingerprint: row.transactionFingerprint,
  }));
}

async function markImportFileDeleted(db: Db, importId: string, deletedAt: Date) {
  await db.bankStatementImport.update({
    where: { id: importId },
    data: { fileDeletedAt: deletedAt },
  });
}

/**
 * Parse + analyze only. Persists import metadata + analysis payload at PREVIEWED.
 * Temp file is always deleted. Does not insert bank_transactions.
 */
export async function previewBankStatementUpload(
  db: Db,
  input: ProcessBankStatementUploadInput,
  options: ProcessBankStatementUploadOptions = {},
): Promise<BankStatementPreviewResult> {
  if (!isAllowedBankStatementFilename(input.originalFilename)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  let tempPath: string | null = null;
  let importId: string | null = null;
  let result: BankStatementPreviewResult | null = null;

  try {
    const written = await writeTempBankStatementFile(input.originalFilename, input.contents);
    tempPath = written.tempPath;

    const fileHash = await hashBankStatementFile(tempPath);
    const parserType =
      options.parserType ??
      options.parser?.parserType ??
      (await detectBankStatementParserType(tempPath, input.originalFilename));

    const importRow = await db.bankStatementImport.create({
      data: {
        bankAccountId: input.bankAccountId ?? null,
        originalFilename: input.originalFilename.trim(),
        fileHash,
        parserType,
        processingStatus: BankStatementImportStatus.PENDING,
        uploadedById: input.uploadedById,
      },
    });
    importId = importRow.id;

    await writeBankingAudit({
      eventType: BANKING_AUDIT_EVENTS.IMPORT_STARTED,
      tableName: "bank_statement_imports",
      recordId: importRow.id,
      action: "CREATE",
      performedBy: input.uploadedById,
      companyId: input.companyId,
      newValue: {
        originalFilename: importRow.originalFilename,
        fileHash,
        parserType,
      },
    });

    const parser = options.parser ?? createBankStatementParser(parserType);
    const parsed = await parser.parse(tempPath);
    const account = await resolveBankAccount(db, input.companyId, parsed, input.bankAccountId);

    if (!account) {
      await db.bankTransactionIssue.create({
        data: {
          bankAccountId: null,
          sourceImportId: importId,
          issueType: BankTransactionIssueType.ACCOUNT_MAPPING_ERROR,
          details: {
            accountNumber: parsed.account.accountNumber,
            message: "Could not map statement to a Bank Account Master record.",
          },
        },
      });

      await db.bankStatementImport.update({
        where: { id: importId },
        data: {
          statementStartDate: parsed.statementStartDate,
          statementEndDate: parsed.statementEndDate,
          transactionsDetected: parsed.transactions.length,
          processingStatus: BankStatementImportStatus.FAILED,
          errorMessage: "Account mapping failed.",
          completedAt: new Date(),
        },
      });

      result = {
        importId,
        processingStatus: BankStatementImportStatus.FAILED,
        parserType,
        bankAccountId: null,
        fileHash,
        fileDeleted: false,
        fileDeletedAt: null,
        transactionsDetected: parsed.transactions.length,
        newTransactions: 0,
        duplicatesDetected: 0,
        mismatchesDetected: 0,
        balanceIssuesDetected: 0,
        errorMessage: "Account mapping failed.",
        preview: null,
        tempPathWas: tempPath,
      };
      return result;
    }

    const existing = await loadExistingSnapshots(db, account.id, parsed);
    const { analyzed, summary, balanceIssues } = analyzeIncomingTransactions(
      account.id,
      parsed.transactions,
      existing,
    );

    const preview = buildStoredPayload({
      company: account.company,
      bankAccount: {
        id: account.id,
        bankName: account.bankName,
        accountName: account.accountName,
        accountNumberMasked: account.accountNumberMasked,
        receivedInAccount: account.receivedInAccount,
      },
      parsed,
      analyzed,
      summary,
      balanceIssues,
    });

    await db.bankStatementImport.update({
      where: { id: importId },
      data: {
        bankAccountId: account.id,
        statementStartDate: parsed.statementStartDate,
        statementEndDate: parsed.statementEndDate,
        transactionsDetected: summary.detected,
        newTransactions: summary.newTransactions,
        duplicatesDetected: summary.exactMatches,
        mismatchesDetected: summary.mismatches,
        balanceIssuesDetected: summary.balanceIssues,
        processingStatus: BankStatementImportStatus.PREVIEWED,
        analysisPayload: preview as unknown as Prisma.InputJsonValue,
        errorMessage: null,
      },
    });

    await writeBankingAudit({
      eventType: BANKING_AUDIT_EVENTS.IMPORT_PREVIEW_READY,
      tableName: "bank_statement_imports",
      recordId: importId,
      action: "UPDATE",
      performedBy: input.uploadedById,
      companyId: input.companyId,
      newValue: {
        processingStatus: BankStatementImportStatus.PREVIEWED,
        summary,
      },
    });

    result = {
      importId,
      processingStatus: BankStatementImportStatus.PREVIEWED,
      parserType,
      bankAccountId: account.id,
      fileHash,
      fileDeleted: false,
      fileDeletedAt: null,
      transactionsDetected: summary.detected,
      newTransactions: summary.newTransactions,
      duplicatesDetected: summary.exactMatches,
      mismatchesDetected: summary.mismatches,
      balanceIssuesDetected: summary.balanceIssues,
      errorMessage: null,
      preview,
      tempPathWas: tempPath,
    };
    return result;
  } catch (err) {
    const message =
      err instanceof BankStatementParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Statement processing failed.";

    if (importId) {
      await db.bankTransactionIssue.create({
        data: {
          bankAccountId: input.bankAccountId ?? null,
          sourceImportId: importId,
          issueType: BankTransactionIssueType.PARSER_ERROR,
          details: { message },
        },
      });

      await db.bankStatementImport.update({
        where: { id: importId },
        data: {
          processingStatus: BankStatementImportStatus.FAILED,
          errorMessage: message.slice(0, 1000),
          completedAt: new Date(),
        },
      });

      await writeBankingAudit({
        eventType: BANKING_AUDIT_EVENTS.IMPORT_FAILED,
        tableName: "bank_statement_imports",
        recordId: importId,
        action: "UPDATE",
        performedBy: input.uploadedById,
        companyId: input.companyId,
        newValue: {
          processingStatus: BankStatementImportStatus.FAILED,
          errorMessage: message,
        },
      });

      result = {
        importId,
        processingStatus: BankStatementImportStatus.FAILED,
        parserType: options.parserType ?? options.parser?.parserType ?? "UNKNOWN",
        bankAccountId: input.bankAccountId ?? null,
        fileHash: "",
        fileDeleted: false,
        fileDeletedAt: null,
        transactionsDetected: 0,
        newTransactions: 0,
        duplicatesDetected: 0,
        mismatchesDetected: 0,
        balanceIssuesDetected: 0,
        errorMessage: message,
        preview: null,
        tempPathWas: tempPath ?? "",
      };
      return result;
    }

    throw err;
  } finally {
    if (tempPath) {
      const deleted = await deleteTempBankStatementFile(tempPath);
      const deletedAt = new Date();
      if (importId) {
        await markImportFileDeleted(db, importId, deletedAt);
      }
      if (result) {
        result.fileDeleted = deleted;
        result.fileDeletedAt = deletedAt.toISOString();
      }
    }
  }
}

/** @deprecated Use previewBankStatementUpload — kept for older call sites/tests. */
export async function processBankStatementUpload(
  db: Db,
  input: ProcessBankStatementUploadInput,
  options: ProcessBankStatementUploadOptions = {},
) {
  return previewBankStatementUpload(db, input, options);
}

export async function confirmBankStatementImport(
  db: Db,
  importId: string,
  actorUserId: string,
  companyId: string,
) {
  const importRow = await db.bankStatementImport.findUnique({ where: { id: importId } });
  if (!importRow) throw new Error("NOT_FOUND");
  if (importRow.processingStatus !== BankStatementImportStatus.PREVIEWED) {
    throw new Error("INVALID_STATUS");
  }
  if (!importRow.bankAccountId || !importRow.analysisPayload) {
    throw new Error("MISSING_ANALYSIS");
  }

  const account = await db.bankAccount.findFirst({
    where: { id: importRow.bankAccountId, companyId },
  });
  if (!account) throw new Error("FORBIDDEN_COMPANY");

  const payload = importRow.analysisPayload as unknown as StoredImportAnalysisPayload;
  const newRows = payload.transactions.filter((row) => row.classification === "NEW");
  const mismatches = payload.transactions.filter((row) => row.classification === "MISMATCH");

  const inserted = await db.$transaction(async (tx) => {
    let created = 0;
    const insertedFingerprints: string[] = [];

    for (const row of newRows) {
      const incoming = deserializeIncoming(row.incoming);
      const fingerprint =
        row.fingerprint || buildTransactionFingerprint(importRow.bankAccountId!, incoming);

      try {
        await tx.bankTransaction.create({
          data: {
            bankAccountId: importRow.bankAccountId!,
            sourceImportId: importId,
            transactionDate: incoming.transactionDate,
            valueDate: incoming.valueDate,
            description: incoming.description,
            referenceNumber: incoming.referenceNumber,
            debitAmount: new Prisma.Decimal(incoming.debitAmount.toFixed(2)),
            creditAmount: new Prisma.Decimal(incoming.creditAmount.toFixed(2)),
            runningBalance: new Prisma.Decimal(incoming.runningBalance.toFixed(2)),
            statementSequence: incoming.statementSequence,
            sourceRowNumber: incoming.sourceRowNumber,
            transactionFingerprint: fingerprint,
            paymentCode:
              incoming.creditAmount > 0 ? await allocateUniquePaymentCode(tx) : null,
            assignmentStatus: "UNASSIGNED",
          },
        });
        created += 1;
        if (insertedFingerprints.length < 50) {
          insertedFingerprints.push(fingerprint);
        }
      } catch (err) {
        // Concurrent confirm / unique fingerprint — treat as already present (idempotent).
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }

    await recordExistingDataMismatches(tx, {
      bankAccountId: importRow.bankAccountId!,
      sourceImportId: importId,
      mismatches: mismatches
        .filter((row) => Boolean(row.existingTransactionId))
        .map((row) => ({
          existingTransactionId: row.existingTransactionId!,
          fieldDiffs: row.fieldDiffs,
          matchMethod: row.matchMethod,
          uploadedDescription: row.incoming.description,
        })),
    });

    // Within-statement issues from preview analysis (no invented rows).
    for (const issue of payload.balanceIssues) {
      await tx.bankTransactionIssue.create({
        data: {
          bankAccountId: importRow.bankAccountId,
          sourceImportId: importId,
          issueType:
            issue.type === "SEQUENCE_GAP"
              ? BankTransactionIssueType.SEQUENCE_GAP
              : BankTransactionIssueType.BALANCE_CONTINUITY_MISMATCH,
          details: issue as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Ledger continuity + boundary gap detection against stored data.
    const ledgerRecon = await runPostImportReconciliation(tx, {
      bankAccountId: importRow.bankAccountId!,
      importId,
    });

    const balanceIssuesDetected =
      payload.summary.balanceIssues + ledgerRecon.created;

    await tx.bankStatementImport.update({
      where: { id: importId },
      data: {
        newTransactions: created,
        duplicatesDetected: payload.summary.exactMatches,
        mismatchesDetected: payload.summary.mismatches,
        balanceIssuesDetected,
        processingStatus: BankStatementImportStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    const exactMatchesSkipped = payload.summary.exactMatches;
    const mismatchesRecorded = mismatches.length;
    const balanceIssuesRecorded = payload.balanceIssues.length + ledgerRecon.created;

    if (exactMatchesSkipped > 0) {
      await writeBankingAuditTx(tx, {
        eventType: BANKING_AUDIT_EVENTS.IMPORT_DUPLICATE_SKIPS,
        tableName: "bank_statement_imports",
        recordId: importId,
        action: "UPDATE",
        performedBy: actorUserId,
        companyId,
        newValue: { exactMatchesSkipped },
      });
    }

    if (created > 0) {
      await writeBankingAuditTx(tx, {
        eventType: BANKING_AUDIT_EVENTS.IMPORT_TRANSACTION_INSERTS,
        tableName: "bank_statement_imports",
        recordId: importId,
        action: "CREATE",
        performedBy: actorUserId,
        companyId,
        newValue: {
          insertedCount: created,
          fingerprintsSample: insertedFingerprints,
        },
      });
    }

    if (mismatchesRecorded > 0) {
      await writeBankingAuditTx(tx, {
        eventType: BANKING_AUDIT_EVENTS.IMPORT_MISMATCHES,
        tableName: "bank_statement_imports",
        recordId: importId,
        action: "UPDATE",
        performedBy: actorUserId,
        companyId,
        newValue: {
          mismatchesRecorded,
          existingTransactionIds: mismatches
            .map((row) => row.existingTransactionId)
            .filter(Boolean)
            .slice(0, 50),
        },
      });
    }

    if (balanceIssuesRecorded > 0) {
      await writeBankingAuditTx(tx, {
        eventType: BANKING_AUDIT_EVENTS.IMPORT_BALANCE_ISSUES,
        tableName: "bank_statement_imports",
        recordId: importId,
        action: "UPDATE",
        performedBy: actorUserId,
        companyId,
        newValue: {
          balanceIssuesRecorded,
          withinStatement: payload.balanceIssues.length,
          ledgerFindings: ledgerRecon.created,
          findingTypes: ledgerRecon.findings.map((f) => f.type),
        },
      });
    }

    await writeBankingAuditTx(tx, {
      eventType: BANKING_AUDIT_EVENTS.IMPORT_CONFIRMED,
      tableName: "bank_statement_imports",
      recordId: importId,
      action: "UPDATE",
      performedBy: actorUserId,
      companyId,
      newValue: {
        processingStatus: BankStatementImportStatus.COMPLETED,
        newTransactions: created,
        exactMatchesSkipped,
        mismatchesRecorded,
        balanceIssuesRecorded,
        reconciliationFindings: ledgerRecon.findings.map((f) => f.type),
      },
    });

    return { created, ledgerFindings: ledgerRecon.created };
  });

  return {
    importId,
    processingStatus: BankStatementImportStatus.COMPLETED,
    newTransactions: inserted.created,
    exactMatchesSkipped: payload.summary.exactMatches,
    mismatchesRecorded: mismatches.length,
    balanceIssuesRecorded: payload.balanceIssues.length + inserted.ledgerFindings,
  };
}

export async function cancelBankStatementImport(
  db: Db,
  importId: string,
  actorUserId: string,
  companyId: string,
) {
  const importRow = await db.bankStatementImport.findUnique({ where: { id: importId } });
  if (!importRow) throw new Error("NOT_FOUND");
  if (importRow.processingStatus !== BankStatementImportStatus.PREVIEWED) {
    throw new Error("INVALID_STATUS");
  }

  if (importRow.bankAccountId) {
    const account = await db.bankAccount.findFirst({
      where: { id: importRow.bankAccountId, companyId },
      select: { id: true },
    });
    if (!account) throw new Error("FORBIDDEN_COMPANY");
  }

  await db.bankStatementImport.update({
    where: { id: importId },
    data: {
      processingStatus: BankStatementImportStatus.CANCELLED,
      completedAt: new Date(),
    },
  });

  await writeBankingAudit({
    eventType: BANKING_AUDIT_EVENTS.IMPORT_CANCELLED,
    tableName: "bank_statement_imports",
    recordId: importId,
    action: "CANCEL",
    performedBy: actorUserId,
    companyId,
  });

  return { importId, processingStatus: BankStatementImportStatus.CANCELLED };
}

export async function processBufferWithGuaranteedTempCleanup<T>(
  originalFilename: string,
  contents: Buffer | Uint8Array,
  work: (tempPath: string) => Promise<T>,
): Promise<{ result: T; tempPath: string; fileDeleted: boolean }> {
  return runWithTempBankStatementFile(originalFilename, contents, work);
}
