import { describe, expect, it } from "vitest";
import {
  analyzeIncomingTransactions,
  buildTransactionFingerprint,
  detectUploadedBalanceContinuity,
  wouldMatchByAmountAlone,
  type ExistingBankTransactionSnapshot,
} from "@/lib/bank-import-analysis";
import type { NormalizedBankTransaction } from "@/lib/bank-statement-types";

const ACCOUNT = "acct-1";

function txn(
  partial: Partial<NormalizedBankTransaction> &
    Pick<NormalizedBankTransaction, "transactionDate" | "description">,
): NormalizedBankTransaction {
  return {
    valueDate: partial.valueDate ?? partial.transactionDate,
    referenceNumber: partial.referenceNumber ?? null,
    debitAmount: partial.debitAmount ?? 0,
    creditAmount: partial.creditAmount ?? 0,
    runningBalance: partial.runningBalance ?? 0,
    statementSequence: partial.statementSequence ?? 1,
    sourceRowNumber: partial.sourceRowNumber ?? 2,
    ...partial,
  };
}

function existing(
  partial: Partial<ExistingBankTransactionSnapshot> &
    Pick<ExistingBankTransactionSnapshot, "id" | "transactionDate" | "description">,
): ExistingBankTransactionSnapshot {
  const base = {
    valueDate: partial.valueDate ?? partial.transactionDate,
    referenceNumber: partial.referenceNumber ?? null,
    debitAmount: partial.debitAmount ?? 0,
    creditAmount: partial.creditAmount ?? 0,
    runningBalance: partial.runningBalance ?? 0,
    statementSequence: partial.statementSequence ?? 1,
    transactionFingerprint: "",
    ...partial,
  };
  return {
    ...base,
    transactionFingerprint:
      partial.transactionFingerprint ||
      buildTransactionFingerprint(ACCOUNT, {
        transactionDate: base.transactionDate,
        description: base.description,
        referenceNumber: base.referenceNumber,
        debitAmount: base.debitAmount,
        creditAmount: base.creditAmount,
        runningBalance: base.runningBalance,
      }),
  };
}

describe("bank import analysis", () => {
  it("matches only when every critical line item is equal (exact)", () => {
    const date = new Date("2026-08-02T00:00:00.000Z");
    const incoming = [
      txn({
        transactionDate: date,
        description: "NEFT CR ACME",
        referenceNumber: "SBIN426214001234",
        creditAmount: 50000,
        runningBalance: 150000,
        statementSequence: 1,
      }),
    ];
    const ledger = [
      existing({
        id: "e1",
        transactionDate: date,
        description: "NEFT CR ACME",
        referenceNumber: "SBIN426214001234",
        creditAmount: 50000,
        runningBalance: 150000,
      }),
    ];

    const { analyzed, summary } = analyzeIncomingTransactions(ACCOUNT, incoming, ledger);
    expect(analyzed[0]!.classification).toBe("EXACT_MATCH");
    expect(analyzed[0]!.matchMethod).toBe("REFERENCE");
    expect(summary.exactMatches).toBe(1);
    expect(summary.newTransactions).toBe(0);
  });

  it("same reused reference with different line items is NEW (not a mismatch)", () => {
    const incoming = [
      txn({
        transactionDate: new Date("2026-07-01T00:00:00.000Z"),
        description: "BY TRANSFER-NEFT*HDFC0000001*SUNTECH ELECTRIC--",
        referenceNumber: "TRANSFERFROM99509044300/",
        creditAmount: 7014,
        runningBalance: 36522.73,
        statementSequence: 1,
      }),
    ];
    const ledger = [
      existing({
        id: "e1",
        transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        description: "BY TRANSFER-NEFT*IBKL0NEFT01*THE AMERICAN SOL--",
        referenceNumber: "TRANSFERFROM99509044300/",
        creditAmount: 100000,
        runningBalance: 1467986.47,
      }),
    ];

    const { analyzed, summary } = analyzeIncomingTransactions(ACCOUNT, incoming, ledger);
    expect(analyzed[0]!.classification).toBe("NEW");
    expect(analyzed[0]!.fieldDiffs).toEqual([]);
    expect(summary.newTransactions).toBe(1);
    expect(summary.mismatches).toBe(0);
  });

  it("same UTR with different amount is NEW so the uploaded row can be recorded", () => {
    const date = new Date("2026-08-02T00:00:00.000Z");
    const incoming = [
      txn({
        transactionDate: date,
        description: "NEFT CR ACME",
        referenceNumber: "SBIN426214001234",
        creditAmount: 55000,
        runningBalance: 155000,
        statementSequence: 1,
      }),
    ];
    const ledger = [
      existing({
        id: "e1",
        transactionDate: date,
        description: "NEFT CR ACME",
        referenceNumber: "SBIN426214001234",
        creditAmount: 50000,
        runningBalance: 150000,
      }),
    ];

    const { analyzed, summary } = analyzeIncomingTransactions(ACCOUNT, incoming, ledger);
    expect(analyzed[0]!.classification).toBe("NEW");
    expect(summary.newTransactions).toBe(1);
    expect(summary.mismatches).toBe(0);
  });

  it("uses strong match without reference when all line items match", () => {
    const date = new Date("2026-08-03T00:00:00.000Z");
    const incoming = [
      txn({
        transactionDate: date,
        description: "CASH DEPOSIT COUNTER",
        referenceNumber: null,
        creditAmount: 2000,
        runningBalance: 12000,
        statementSequence: 5,
      }),
    ];
    const ledger = [
      existing({
        id: "e2",
        transactionDate: date,
        description: "CASH DEPOSIT COUNTER",
        referenceNumber: null,
        creditAmount: 2000,
        runningBalance: 12000,
        statementSequence: 1,
      }),
    ];

    const { analyzed } = analyzeIncomingTransactions(ACCOUNT, incoming, ledger);
    expect(analyzed[0]!.classification).toBe("EXACT_MATCH");
    expect(analyzed[0]!.matchMethod).toBe("STRONG");
  });

  it("never deduplicates by amount alone", () => {
    const a = txn({
      transactionDate: new Date("2026-08-01T00:00:00.000Z"),
      description: "Payment A",
      referenceNumber: "REF-A",
      creditAmount: 1000,
      runningBalance: 5000,
      statementSequence: 1,
    });
    const b = txn({
      transactionDate: new Date("2026-08-10T00:00:00.000Z"),
      description: "Payment B",
      referenceNumber: "REF-B",
      creditAmount: 1000,
      runningBalance: 9000,
      statementSequence: 2,
    });

    expect(wouldMatchByAmountAlone(a, b)).toBe(true);

    const { analyzed } = analyzeIncomingTransactions(ACCOUNT, [b], [
      existing({
        id: "e-a",
        transactionDate: a.transactionDate,
        description: a.description,
        referenceNumber: a.referenceNumber,
        creditAmount: a.creditAmount,
        runningBalance: a.runningBalance,
      }),
    ]);

    expect(analyzed[0]!.classification).toBe("NEW");
  });

  it("marks genuinely new overlapping-period rows as NEW", () => {
    const existingRow = existing({
      id: "e1",
      transactionDate: new Date("2026-08-01T00:00:00.000Z"),
      description: "OLD",
      referenceNumber: "UTR-OLD",
      creditAmount: 100,
      runningBalance: 100,
    });
    const incoming = [
      txn({
        transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        description: "OLD",
        referenceNumber: "UTR-OLD",
        creditAmount: 100,
        runningBalance: 100,
        statementSequence: 1,
      }),
      txn({
        transactionDate: new Date("2026-08-15T00:00:00.000Z"),
        description: "NEW ROW",
        referenceNumber: "UTR-NEW",
        creditAmount: 250,
        runningBalance: 350,
        statementSequence: 2,
      }),
    ];

    const { summary } = analyzeIncomingTransactions(ACCOUNT, incoming, [existingRow]);
    expect(summary.exactMatches).toBe(1);
    expect(summary.newTransactions).toBe(1);
  });

  it("same logical transaction keeps stable fingerprint across sequence changes", () => {
    const base = {
      transactionDate: new Date("2026-08-02T00:00:00.000Z"),
      description: "NEFT CR",
      referenceNumber: "SBIN999",
      debitAmount: 0,
      creditAmount: 10,
      runningBalance: 100,
    };
    const a = buildTransactionFingerprint(ACCOUNT, { ...base });
    const b = buildTransactionFingerprint(ACCOUNT, { ...base });
    expect(a).toBe(b);
    expect(a).not.toMatch(/amount-only/i);
  });

  it("detects within-file balance continuity issues", () => {
    const issues = detectUploadedBalanceContinuity([
      txn({
        transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        description: "A",
        creditAmount: 100,
        runningBalance: 100,
        statementSequence: 1,
      }),
      txn({
        transactionDate: new Date("2026-08-02T00:00:00.000Z"),
        description: "B",
        creditAmount: 50,
        runningBalance: 200,
        statementSequence: 2,
      }),
    ]);
    expect(issues.some((i) => i.type === "BALANCE_CONTINUITY_MISMATCH")).toBe(true);
  });
});
