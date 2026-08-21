/**
 * Bank ledger reconciliation engine (pure).
 * Never invents transactions — only diagnoses mismatches, balance breaks, and gaps.
 */

export type LedgerTxn = {
  id: string;
  sourceImportId: string | null;
  transactionDate: Date;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  statementSequence: number;
  referenceNumber: string | null;
  description: string;
};

export type ReconciliationFindingType =
  | "EXISTING_DATA_MISMATCH"
  | "BALANCE_CONTINUITY_MISMATCH"
  | "POSSIBLE_MISSING_TRANSACTION"
  | "SEQUENCE_GAP";

export type ReconciliationFinding = {
  type: ReconciliationFindingType;
  bankTransactionId: string | null;
  /** Prior ledger row when the break is between two stored rows. */
  previousTransactionId: string | null;
  message: string;
  expectedBalance?: number;
  actualBalance?: number;
  existingValues?: Record<string, string | number | null>;
  uploadedValues?: Record<string, string | number | null>;
  details?: Record<string, unknown>;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyEqual(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function sortLedgerTransactions<T extends LedgerTxn>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = dateKey(a.transactionDate);
    const db = dateKey(b.transactionDate);
    if (da !== db) return da < db ? -1 : 1;
    if (a.statementSequence !== b.statementSequence) {
      return a.statementSequence - b.statementSequence;
    }
    return a.id.localeCompare(b.id);
  });
}

export function expectedBalanceAfter(
  previousBalance: number,
  creditAmount: number,
  debitAmount: number,
): number {
  return roundMoney(previousBalance + creditAmount - debitAmount);
}

/**
 * Validate: expected current = previous + credit − debit for consecutive ledger rows.
 */
export function detectLedgerBalanceContinuity(transactions: LedgerTxn[]): ReconciliationFinding[] {
  const ordered = sortLedgerTransactions(transactions);
  const findings: ReconciliationFinding[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]!;
    const curr = ordered[i]!;
    const expected = expectedBalanceAfter(
      prev.runningBalance,
      curr.creditAmount,
      curr.debitAmount,
    );
    if (!moneyEqual(expected, curr.runningBalance)) {
      findings.push({
        type: "BALANCE_CONTINUITY_MISMATCH",
        bankTransactionId: curr.id,
        previousTransactionId: prev.id,
        message: `Expected balance ${expected.toFixed(2)} after ${dateKey(curr.transactionDate)} seq ${curr.statementSequence}, found ${roundMoney(curr.runningBalance).toFixed(2)}.`,
        expectedBalance: expected,
        actualBalance: roundMoney(curr.runningBalance),
        details: {
          previousDate: dateKey(prev.transactionDate),
          previousBalance: roundMoney(prev.runningBalance),
          debitAmount: roundMoney(curr.debitAmount),
          creditAmount: roundMoney(curr.creditAmount),
        },
      });
    }
  }

  return findings;
}

/**
 * Boundary between previously stored data and newly imported rows.
 * Balance break at old→new edge ⇒ POSSIBLE_MISSING_TRANSACTION (never invent fills).
 * Sequence discontinuity across that edge ⇒ SEQUENCE_GAP.
 */
export function detectImportBoundaryGaps(
  transactions: LedgerTxn[],
  newImportId: string,
): ReconciliationFinding[] {
  const ordered = sortLedgerTransactions(transactions);
  const findings: ReconciliationFinding[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]!;
    const curr = ordered[i]!;
    const crossingIntoNew =
      prev.sourceImportId !== newImportId && curr.sourceImportId === newImportId;
    const crossingOutOfNew =
      prev.sourceImportId === newImportId && curr.sourceImportId !== newImportId;

    if (!crossingIntoNew && !crossingOutOfNew) continue;

    const expected = expectedBalanceAfter(
      prev.runningBalance,
      curr.creditAmount,
      curr.debitAmount,
    );
    const balanceBreak = !moneyEqual(expected, curr.runningBalance);

    if (balanceBreak) {
      findings.push({
        type: "POSSIBLE_MISSING_TRANSACTION",
        bankTransactionId: curr.id,
        previousTransactionId: prev.id,
        message: crossingIntoNew
          ? `Balance does not continue from existing ledger (${roundMoney(prev.runningBalance).toFixed(2)}) into newly imported data (expected ${expected.toFixed(2)}, found ${roundMoney(curr.runningBalance).toFixed(2)}). Possible missing transaction(s) — none were invented.`
          : `Balance does not continue from newly imported data into later existing ledger rows (expected ${expected.toFixed(2)}, found ${roundMoney(curr.runningBalance).toFixed(2)}). Possible missing transaction(s) — none were invented.`,
        expectedBalance: expected,
        actualBalance: roundMoney(curr.runningBalance),
        details: {
          boundary: crossingIntoNew ? "EXISTING_TO_NEW" : "NEW_TO_EXISTING",
          previousImportId: prev.sourceImportId,
          currentImportId: curr.sourceImportId,
          newImportId,
        },
      });
    }

    // Same calendar day with non-contiguous statement sequences across imports.
    if (
      dateKey(prev.transactionDate) === dateKey(curr.transactionDate) &&
      curr.statementSequence > prev.statementSequence + 1
    ) {
      findings.push({
        type: "SEQUENCE_GAP",
        bankTransactionId: curr.id,
        previousTransactionId: prev.id,
        message: `Statement sequence gap on ${dateKey(curr.transactionDate)} between seq ${prev.statementSequence} and ${curr.statementSequence} at import boundary.`,
        details: {
          previousSequence: prev.statementSequence,
          currentSequence: curr.statementSequence,
          boundary: crossingIntoNew ? "EXISTING_TO_NEW" : "NEW_TO_EXISTING",
        },
      });
    }
  }

  return findings;
}

/**
 * Full post-import pass: ledger continuity + boundary gap diagnostics.
 * Dedupes identical balance findings that overlap with boundary POSSIBLE_MISSING.
 */
export function reconcileLedgerAfterImport(
  transactions: LedgerTxn[],
  newImportId: string,
): ReconciliationFinding[] {
  const continuity = detectLedgerBalanceContinuity(transactions);
  const gaps = detectImportBoundaryGaps(transactions, newImportId);

  const gapKeys = new Set(
    gaps
      .filter((g) => g.type === "POSSIBLE_MISSING_TRANSACTION")
      .map((g) => `${g.previousTransactionId}|${g.bankTransactionId}`),
  );

  const filteredContinuity = continuity.filter(
    (finding) => !gapKeys.has(`${finding.previousTransactionId}|${finding.bankTransactionId}`),
  );

  return [...filteredContinuity, ...gaps];
}

export type ExistingDataMismatchInput = {
  existingTransactionId: string;
  fieldDiffs: Array<{
    field: string;
    existing: string | number | null;
    uploaded: string | number | null;
  }>;
  matchMethod?: string | null;
  uploadedDescription?: string;
};

export function buildExistingDataMismatchFinding(
  input: ExistingDataMismatchInput,
): ReconciliationFinding {
  return {
    type: "EXISTING_DATA_MISMATCH",
    bankTransactionId: input.existingTransactionId,
    previousTransactionId: null,
    message: `Existing transaction differs from uploaded values (${input.fieldDiffs.map((d) => d.field).join(", ")}). Historical row was not overwritten.`,
    existingValues: Object.fromEntries(input.fieldDiffs.map((d) => [d.field, d.existing])),
    uploadedValues: Object.fromEntries(input.fieldDiffs.map((d) => [d.field, d.uploaded])),
    details: {
      matchMethod: input.matchMethod ?? null,
      description: input.uploadedDescription ?? null,
    },
  };
}
