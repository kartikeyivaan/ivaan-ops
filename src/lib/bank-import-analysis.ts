import { createHash } from "crypto";
import type { NormalizedBankTransaction } from "@/lib/bank-statement-types";

export type ExistingBankTransactionSnapshot = {
  id: string;
  transactionDate: Date;
  valueDate: Date | null;
  description: string;
  referenceNumber: string | null;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  statementSequence: number;
  transactionFingerprint: string;
};

export type MatchMethod = "REFERENCE" | "STRONG" | "FINGERPRINT";
export type MatchClassification = "EXACT_MATCH" | "MISMATCH" | "NEW";

export type FieldDiff = {
  field: string;
  existing: string | number | null;
  uploaded: string | number | null;
};

export type AnalyzedIncomingTransaction = {
  incoming: NormalizedBankTransaction;
  fingerprint: string;
  classification: MatchClassification;
  matchMethod: MatchMethod | null;
  existingTransactionId: string | null;
  fieldDiffs: FieldDiff[];
};

export type BalanceSequenceIssue = {
  type: "BALANCE_CONTINUITY_MISMATCH" | "SEQUENCE_GAP";
  message: string;
  statementSequence: number | null;
  expectedBalance?: number;
  actualBalance?: number;
};

export type ImportAnalysisSummary = {
  detected: number;
  exactMatches: number;
  newTransactions: number;
  mismatches: number;
  balanceIssues: number;
};

const CRITICAL_FIELDS = [
  "transactionDate",
  "valueDate",
  "description",
  "referenceNumber",
  "debitAmount",
  "creditAmount",
  "runningBalance",
] as const;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyEqual(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;
}

function dateKey(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function normalizeReference(reference: string | null | undefined): string | null {
  const raw = (reference ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return raw || null;
}

function normalizeDescription(description: string): string {
  return description.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 120);
}

function directionOf(txn: { debitAmount: number; creditAmount: number }): "DEBIT" | "CREDIT" {
  return txn.creditAmount > 0 && !(txn.debitAmount > 0) ? "CREDIT" : "DEBIT";
}

function amountOf(txn: { debitAmount: number; creditAmount: number }): number {
  return directionOf(txn) === "CREDIT" ? roundMoney(txn.creditAmount) : roundMoney(txn.debitAmount);
}

/**
 * Deterministic fingerprint — never amount alone.
 * With reference: account + ref + date + amounts + balance.
 * Without reference: account + date + direction + amount + running balance + description.
 * Excludes statement sequence so overlapping statements can match the same logical row.
 */
export function buildTransactionFingerprint(
  bankAccountId: string,
  txn: Pick<
    NormalizedBankTransaction,
    | "transactionDate"
    | "description"
    | "referenceNumber"
    | "debitAmount"
    | "creditAmount"
    | "runningBalance"
  >,
): string {
  const ref = normalizeReference(txn.referenceNumber);
  const date = dateKey(txn.transactionDate) ?? "";
  const desc = normalizeDescription(txn.description);
  const debit = roundMoney(txn.debitAmount).toFixed(2);
  const credit = roundMoney(txn.creditAmount).toFixed(2);
  const balance = roundMoney(txn.runningBalance).toFixed(2);
  const direction = directionOf(txn);
  const amount = amountOf(txn).toFixed(2);

  const payload = ref
    ? ["v1", bankAccountId, "REF", ref, date, debit, credit, balance].join("|")
    : ["v1", bankAccountId, "NOREF", date, direction, amount, balance, desc].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

function snapshotField(
  txn: ExistingBankTransactionSnapshot | NormalizedBankTransaction,
  field: (typeof CRITICAL_FIELDS)[number],
): string | number | null {
  switch (field) {
    case "transactionDate":
      return dateKey(txn.transactionDate);
    case "valueDate":
      return dateKey(txn.valueDate);
    case "description":
      return normalizeDescription(txn.description);
    case "referenceNumber":
      return normalizeReference(txn.referenceNumber);
    case "debitAmount":
      return roundMoney(txn.debitAmount);
    case "creditAmount":
      return roundMoney(txn.creditAmount);
    case "runningBalance":
      return roundMoney(txn.runningBalance);
  }
}

function compareCriticalFields(
  existing: ExistingBankTransactionSnapshot,
  incoming: NormalizedBankTransaction,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of CRITICAL_FIELDS) {
    const left = snapshotField(existing, field);
    const right = snapshotField(incoming, field);
    if (typeof left === "number" && typeof right === "number") {
      if (!moneyEqual(left, right)) {
        diffs.push({ field, existing: left, uploaded: right });
      }
      continue;
    }
    if ((left ?? null) !== (right ?? null)) {
      diffs.push({ field, existing: left, uploaded: right });
    }
  }
  return diffs;
}

function findByReference(
  existing: ExistingBankTransactionSnapshot[],
  incoming: NormalizedBankTransaction,
): ExistingBankTransactionSnapshot | null {
  const ref = normalizeReference(incoming.referenceNumber);
  if (!ref) return null;
  return (
    existing.find((row) => normalizeReference(row.referenceNumber) === ref) ?? null
  );
}

/**
 * Strong match when reference is unavailable:
 * same date + direction + amount + running balance.
 * Never amount alone.
 */
function findByStrongIdentity(
  existing: ExistingBankTransactionSnapshot[],
  incoming: NormalizedBankTransaction,
): ExistingBankTransactionSnapshot | null {
  if (normalizeReference(incoming.referenceNumber)) return null;
  const date = dateKey(incoming.transactionDate);
  const direction = directionOf(incoming);
  const amount = amountOf(incoming);
  const balance = roundMoney(incoming.runningBalance);

  return (
    existing.find((row) => {
      if (normalizeReference(row.referenceNumber)) return false;
      return (
        dateKey(row.transactionDate) === date &&
        directionOf(row) === direction &&
        moneyEqual(amountOf(row), amount) &&
        moneyEqual(row.runningBalance, balance)
      );
    }) ?? null
  );
}

function findByFingerprint(
  existing: ExistingBankTransactionSnapshot[],
  fingerprint: string,
): ExistingBankTransactionSnapshot | null {
  return existing.find((row) => row.transactionFingerprint === fingerprint) ?? null;
}

/**
 * Classify each incoming row against existing ledger rows using the PRD matching hierarchy.
 */
export function analyzeIncomingTransactions(
  bankAccountId: string,
  incoming: NormalizedBankTransaction[],
  existing: ExistingBankTransactionSnapshot[],
): {
  analyzed: AnalyzedIncomingTransaction[];
  summary: ImportAnalysisSummary;
  balanceIssues: BalanceSequenceIssue[];
} {
  const analyzed: AnalyzedIncomingTransaction[] = [];
  const claimedExistingIds = new Set<string>();

  for (const txn of incoming) {
    const fingerprint = buildTransactionFingerprint(bankAccountId, txn);

    let match: ExistingBankTransactionSnapshot | null = null;
    let matchMethod: MatchMethod | null = null;

    const byRef = findByReference(existing, txn);
    if (byRef && !claimedExistingIds.has(byRef.id)) {
      match = byRef;
      matchMethod = "REFERENCE";
    } else {
      const byStrong = findByStrongIdentity(existing, txn);
      if (byStrong && !claimedExistingIds.has(byStrong.id)) {
        match = byStrong;
        matchMethod = "STRONG";
      } else {
        const byFp = findByFingerprint(existing, fingerprint);
        if (byFp && !claimedExistingIds.has(byFp.id)) {
          match = byFp;
          matchMethod = "FINGERPRINT";
        }
      }
    }

    if (!match) {
      analyzed.push({
        incoming: txn,
        fingerprint,
        classification: "NEW",
        matchMethod: null,
        existingTransactionId: null,
        fieldDiffs: [],
      });
      continue;
    }

    claimedExistingIds.add(match.id);
    const fieldDiffs = compareCriticalFields(match, txn);
    analyzed.push({
      incoming: txn,
      fingerprint,
      classification: fieldDiffs.length === 0 ? "EXACT_MATCH" : "MISMATCH",
      matchMethod,
      existingTransactionId: match.id,
      fieldDiffs,
    });
  }

  const balanceIssues = detectUploadedBalanceContinuity(incoming);

  const summary: ImportAnalysisSummary = {
    detected: analyzed.length,
    exactMatches: analyzed.filter((row) => row.classification === "EXACT_MATCH").length,
    newTransactions: analyzed.filter((row) => row.classification === "NEW").length,
    mismatches: analyzed.filter((row) => row.classification === "MISMATCH").length,
    balanceIssues: balanceIssues.length,
  };

  return { analyzed, summary, balanceIssues };
}

/** Within-file running balance check for preview (Command 6 expands ledger gap detection). */
export function detectUploadedBalanceContinuity(
  transactions: NormalizedBankTransaction[],
): BalanceSequenceIssue[] {
  const issues: BalanceSequenceIssue[] = [];
  if (transactions.length < 2) return issues;

  for (let i = 1; i < transactions.length; i += 1) {
    const prev = transactions[i - 1]!;
    const curr = transactions[i]!;
    const expected = roundMoney(prev.runningBalance + curr.creditAmount - curr.debitAmount);
    if (!moneyEqual(expected, curr.runningBalance)) {
      issues.push({
        type: "BALANCE_CONTINUITY_MISMATCH",
        message: `Expected balance ${expected.toFixed(2)} after sequence ${curr.statementSequence}, found ${roundMoney(curr.runningBalance).toFixed(2)}.`,
        statementSequence: curr.statementSequence,
        expectedBalance: expected,
        actualBalance: roundMoney(curr.runningBalance),
      });
    }

    if (curr.statementSequence !== prev.statementSequence + 1) {
      issues.push({
        type: "SEQUENCE_GAP",
        message: `Statement sequence jumped from ${prev.statementSequence} to ${curr.statementSequence}.`,
        statementSequence: curr.statementSequence,
      });
    }
  }

  return issues;
}

/** Prove we never treat two different rows as duplicates by amount alone. */
export function wouldMatchByAmountAlone(
  a: NormalizedBankTransaction,
  b: NormalizedBankTransaction,
): boolean {
  return moneyEqual(amountOf(a), amountOf(b)) && directionOf(a) === directionOf(b);
}
