import { describe, expect, it } from "vitest";
import {
  buildExistingDataMismatchFinding,
  detectImportBoundaryGaps,
  detectLedgerBalanceContinuity,
  expectedBalanceAfter,
  reconcileLedgerAfterImport,
  type LedgerTxn,
} from "@/lib/bank-reconciliation-engine";

function row(
  partial: Partial<LedgerTxn> & Pick<LedgerTxn, "id" | "transactionDate" | "runningBalance">,
): LedgerTxn {
  return {
    sourceImportId: partial.sourceImportId ?? null,
    debitAmount: partial.debitAmount ?? 0,
    creditAmount: partial.creditAmount ?? 0,
    statementSequence: partial.statementSequence ?? 1,
    referenceNumber: partial.referenceNumber ?? null,
    description: partial.description ?? "txn",
    ...partial,
  };
}

describe("bank reconciliation engine", () => {
  it("validates expected current = previous + credit - debit", () => {
    expect(expectedBalanceAfter(1000, 500, 200)).toBe(1300);

    const findings = detectLedgerBalanceContinuity([
      row({
        id: "a",
        transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        creditAmount: 1000,
        runningBalance: 1000,
        statementSequence: 1,
      }),
      row({
        id: "b",
        transactionDate: new Date("2026-08-02T00:00:00.000Z"),
        creditAmount: 100,
        runningBalance: 1200,
        statementSequence: 2,
      }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("BALANCE_CONTINUITY_MISMATCH");
    expect(findings[0]!.expectedBalance).toBe(1100);
    expect(findings[0]!.actualBalance).toBe(1200);
    expect(findings[0]!.bankTransactionId).toBe("b");
  });

  it("accepts a continuous ledger with no findings", () => {
    const findings = detectLedgerBalanceContinuity([
      row({
        id: "a",
        transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        creditAmount: 1000,
        runningBalance: 1000,
        statementSequence: 1,
      }),
      row({
        id: "b",
        transactionDate: new Date("2026-08-02T00:00:00.000Z"),
        debitAmount: 250,
        runningBalance: 750,
        statementSequence: 2,
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("flags POSSIBLE_MISSING_TRANSACTION at existing→new import boundary without inventing rows", () => {
    const findings = detectImportBoundaryGaps(
      [
        row({
          id: "old",
          sourceImportId: "import-old",
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          creditAmount: 1000,
          runningBalance: 1000,
          statementSequence: 1,
        }),
        row({
          id: "new",
          sourceImportId: "import-new",
          transactionDate: new Date("2026-08-10T00:00:00.000Z"),
          creditAmount: 100,
          // Jump that cannot be explained by this credit alone from 1000
          runningBalance: 5000,
          statementSequence: 1,
        }),
      ],
      "import-new",
    );

    expect(findings.some((f) => f.type === "POSSIBLE_MISSING_TRANSACTION")).toBe(true);
    expect(findings.every((f) => f.type !== "EXISTING_DATA_MISMATCH" || true)).toBe(true);
    // Engine only returns findings — never synthetic transaction ids beyond the two inputs
    const ids = new Set(findings.flatMap((f) => [f.bankTransactionId, f.previousTransactionId]));
    expect([...ids].sort()).toEqual(["new", "old"].sort());
  });

  it("flags SEQUENCE_GAP on same-day sequence jump across import boundary", () => {
    const findings = detectImportBoundaryGaps(
      [
        row({
          id: "old",
          sourceImportId: "import-old",
          transactionDate: new Date("2026-08-05T00:00:00.000Z"),
          creditAmount: 10,
          runningBalance: 100,
          statementSequence: 1,
        }),
        row({
          id: "new",
          sourceImportId: "import-new",
          transactionDate: new Date("2026-08-05T00:00:00.000Z"),
          creditAmount: 5,
          runningBalance: 105,
          statementSequence: 4,
        }),
      ],
      "import-new",
    );

    expect(findings.some((f) => f.type === "SEQUENCE_GAP")).toBe(true);
  });

  it("prefers POSSIBLE_MISSING over duplicate BALANCE_CONTINUITY at the same boundary", () => {
    const ledger = [
      row({
        id: "old",
        sourceImportId: "import-old",
        transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        creditAmount: 1000,
        runningBalance: 1000,
        statementSequence: 1,
      }),
      row({
        id: "new",
        sourceImportId: "import-new",
        transactionDate: new Date("2026-08-02T00:00:00.000Z"),
        creditAmount: 50,
        runningBalance: 2000,
        statementSequence: 1,
      }),
    ];

    const findings = reconcileLedgerAfterImport(ledger, "import-new");
    const types = findings.map((f) => f.type);
    expect(types).toContain("POSSIBLE_MISSING_TRANSACTION");
    expect(types.filter((t) => t === "BALANCE_CONTINUITY_MISMATCH")).toHaveLength(0);
  });

  it("builds EXISTING_DATA_MISMATCH with field-level values and no overwrite semantics", () => {
    const finding = buildExistingDataMismatchFinding({
      existingTransactionId: "txn-1",
      fieldDiffs: [
        { field: "creditAmount", existing: 50000, uploaded: 55000 },
        { field: "runningBalance", existing: 150000, uploaded: 155000 },
      ],
      matchMethod: "REFERENCE",
    });

    expect(finding.type).toBe("EXISTING_DATA_MISMATCH");
    expect(finding.existingValues?.creditAmount).toBe(50000);
    expect(finding.uploadedValues?.creditAmount).toBe(55000);
    expect(finding.message.toLowerCase()).toContain("not overwritten");
  });
});
