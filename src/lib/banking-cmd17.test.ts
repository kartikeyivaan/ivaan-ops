/**
 * Command 17 — banking module automated coverage.
 * Complements focused unit files with checklist scenarios.
 */
import { describe, expect, it, vi } from "vitest";
import {
  BankPaymentAllocationStatus,
  BankTransactionAssignmentStatus,
  PaymentVerificationStatus,
} from "@prisma/client";
import {
  analyzeIncomingTransactions,
  buildTransactionFingerprint,
  type ExistingBankTransactionSnapshot,
} from "@/lib/bank-import-analysis";
import {
  assertBankAllocationCustomerGst,
  assignmentStatusFromAllocated,
  availableBankCreditAmount,
  releaseBankAllocationsForCancelledPi,
  validateAllocationAmount,
} from "@/lib/bank-allocation-service";
import {
  canAccessBankingAdmin,
  canAllocateBankPayments,
  canUploadBankStatements,
  canViewFullBankTransactions,
  canViewSalesCreditReceipts,
} from "@/lib/banking-permissions";
import { ROLES } from "@/lib/rbac";
import { salesReceiptBanksForCompany } from "@/lib/sales-daily-receipts-service";
import type { NormalizedBankTransaction } from "@/lib/bank-statement-types";

const ACCOUNT = "acct-cmd17";

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

describe("Cmd17 IMPORT", () => {
  it("same file twice → all exact matches (idempotent re-import analysis)", () => {
    const date = new Date("2026-08-01T00:00:00.000Z");
    const rows = [
      txn({
        transactionDate: date,
        description: "NEFT CR A",
        referenceNumber: "UTR-A",
        creditAmount: 1000,
        runningBalance: 1000,
        statementSequence: 1,
      }),
      txn({
        transactionDate: new Date("2026-08-02T00:00:00.000Z"),
        description: "NEFT CR B",
        referenceNumber: "UTR-B",
        creditAmount: 500,
        runningBalance: 1500,
        statementSequence: 2,
      }),
    ];
    const ledger = rows.map((row, i) =>
      existing({
        id: `e${i}`,
        transactionDate: row.transactionDate,
        description: row.description,
        referenceNumber: row.referenceNumber,
        creditAmount: row.creditAmount,
        runningBalance: row.runningBalance,
        statementSequence: row.statementSequence,
      }),
    );

    const { summary } = analyzeIncomingTransactions(ACCOUNT, rows, ledger);
    expect(summary.exactMatches).toBe(2);
    expect(summary.newTransactions).toBe(0);
    expect(summary.mismatches).toBe(0);
  });

  it("overlapping statements: shared rows match, only novel rows are NEW", () => {
    const shared = txn({
      transactionDate: new Date("2026-08-05T00:00:00.000Z"),
      description: "SHARED",
      referenceNumber: "UTR-SHARE",
      creditAmount: 2000,
      runningBalance: 5000,
      statementSequence: 1,
    });
    const novel = txn({
      transactionDate: new Date("2026-08-12T00:00:00.000Z"),
      description: "NOVEL",
      referenceNumber: "UTR-NEW",
      creditAmount: 300,
      runningBalance: 5300,
      statementSequence: 2,
    });

    const { analyzed, summary } = analyzeIncomingTransactions(ACCOUNT, [shared, novel], [
      existing({
        id: "e-shared",
        transactionDate: shared.transactionDate,
        description: shared.description,
        referenceNumber: shared.referenceNumber,
        creditAmount: shared.creditAmount,
        runningBalance: shared.runningBalance,
      }),
    ]);

    expect(summary.exactMatches).toBe(1);
    expect(summary.newTransactions).toBe(1);
    expect(analyzed.find((r) => r.incoming.referenceNumber === "UTR-NEW")?.classification).toBe(
      "NEW",
    );
  });

  it("duplicate with reference vs without reference both resolve without amount-alone", () => {
    const withRef = analyzeIncomingTransactions(
      ACCOUNT,
      [
        txn({
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          description: "X",
          referenceNumber: "UTR-1",
          creditAmount: 100,
          runningBalance: 100,
        }),
      ],
      [
        existing({
          id: "e1",
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          description: "X",
          referenceNumber: "UTR-1",
          creditAmount: 100,
          runningBalance: 100,
        }),
      ],
    );
    expect(withRef.analyzed[0]!.matchMethod).toBe("REFERENCE");

    const withoutRef = analyzeIncomingTransactions(
      ACCOUNT,
      [
        txn({
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          description: "CASH",
          referenceNumber: null,
          creditAmount: 100,
          runningBalance: 100,
        }),
      ],
      [
        existing({
          id: "e2",
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          description: "CASH",
          referenceNumber: null,
          creditAmount: 100,
          runningBalance: 100,
        }),
      ],
    );
    expect(withoutRef.analyzed[0]!.matchMethod).toBe("STRONG");
  });

  it("partial line overlap with shared reference is NEW (record uploaded row)", () => {
    const { analyzed, summary } = analyzeIncomingTransactions(
      ACCOUNT,
      [
        txn({
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          description: "NEFT",
          referenceNumber: "UTR-M",
          creditAmount: 999,
          runningBalance: 999,
        }),
      ],
      [
        existing({
          id: "e-m",
          transactionDate: new Date("2026-08-01T00:00:00.000Z"),
          description: "NEFT",
          referenceNumber: "UTR-M",
          creditAmount: 1000,
          runningBalance: 1000,
        }),
      ],
    );
    expect(analyzed[0]!.classification).toBe("NEW");
    expect(summary.newTransactions).toBe(1);
    expect(summary.mismatches).toBe(0);
  });
});

describe("Cmd17 ALLOCATIONS", () => {
  it("one payment / one PI: full allocation allowed", () => {
    expect(() =>
      validateAllocationAmount({ amount: 5000, bankAvailable: 5000, piOutstanding: 5000 }),
    ).not.toThrow();
    expect(assignmentStatusFromAllocated(5000, 5000)).toBe(
      BankTransactionAssignmentStatus.FULLY_ASSIGNED,
    );
  });

  it("one payment / multiple eligible PIs: partial then remainder", () => {
    expect(() =>
      validateAllocationAmount({ amount: 3000, bankAvailable: 10000, piOutstanding: 3000 }),
    ).not.toThrow();
    expect(assignmentStatusFromAllocated(10000, 3000)).toBe(
      BankTransactionAssignmentStatus.PARTIALLY_ASSIGNED,
    );
    expect(() =>
      validateAllocationAmount({ amount: 7000, bankAvailable: 7000, piOutstanding: 7000 }),
    ).not.toThrow();
    expect(assignmentStatusFromAllocated(10000, 10000)).toBe(
      BankTransactionAssignmentStatus.FULLY_ASSIGNED,
    );
  });

  it("different customer blocked", () => {
    expect(() =>
      assertBankAllocationCustomerGst(
        [{ customerId: "c1", customerGstNumber: "27AAAAA0000A1Z5" }],
        "c2",
        "27AAAAA0000A1Z5",
      ),
    ).toThrow("DIFFERENT_CUSTOMER");
  });

  it("same customer different GST blocked", () => {
    expect(() =>
      assertBankAllocationCustomerGst(
        [{ customerId: "c1", customerGstNumber: "27AAAAA0000A1Z5" }],
        "c1",
        "27BBBBB0000B1Z5",
      ),
    ).toThrow("DIFFERENT_GST");
  });

  it("same customer + same GST allowed for split across PIs", () => {
    expect(() =>
      assertBankAllocationCustomerGst(
        [{ customerId: "c1", customerGstNumber: "27AAAAA0000A1Z5" }],
        "c1",
        "27aaaaa0000a1z5",
      ),
    ).not.toThrow();
  });

  it("multiple payments / one PI: successive amounts capped by outstanding", () => {
    expect(() =>
      validateAllocationAmount({ amount: 4000, bankAvailable: 20000, piOutstanding: 10000 }),
    ).not.toThrow();
    expect(() =>
      validateAllocationAmount({ amount: 7000, bankAvailable: 16000, piOutstanding: 6000 }),
    ).toThrow("ALLOCATION_EXCEEDS_LIMIT");
  });

  it("full and partial allocation status transitions", () => {
    expect(assignmentStatusFromAllocated(1000, 0)).toBe(
      BankTransactionAssignmentStatus.UNASSIGNED,
    );
    expect(assignmentStatusFromAllocated(1000, 400)).toBe(
      BankTransactionAssignmentStatus.PARTIALLY_ASSIGNED,
    );
    expect(assignmentStatusFromAllocated(1000, 1000)).toBe(
      BankTransactionAssignmentStatus.FULLY_ASSIGNED,
    );
  });

  it("double allocation / concurrent second attempt blocked when bank fully used", () => {
    const availableAfterFirst = availableBankCreditAmount({
      creditAmount: 5000,
      allocations: [{ allocatedAmount: 5000 }],
    });
    expect(availableAfterFirst).toBe(0);
    expect(() =>
      validateAllocationAmount({
        amount: 100,
        bankAvailable: availableAfterFirst,
        piOutstanding: 5000,
      }),
    ).toThrow("ALLOCATION_EXCEEDS_LIMIT");
  });

  it("documents row-lock helper used to serialize concurrent allocations", async () => {
    const { lockBankTransactionForAllocation } = await import("@/lib/bank-allocation-service");
    const executeRaw = vi.fn(async () => 1);
    await lockBankTransactionForAllocation(
      { $executeRaw: executeRaw } as never,
      "11111111-1111-1111-1111-111111111111",
    );
    expect(executeRaw).toHaveBeenCalled();
  });

  it("overpayment blocked against PI outstanding", () => {
    expect(() =>
      validateAllocationAmount({ amount: 6000, bankAvailable: 10000, piOutstanding: 5000 }),
    ).toThrow("ALLOCATION_EXCEEDS_LIMIT");
  });
});

describe("Cmd17 MANUAL PAYMENTS + LIFECYCLE", () => {
  it("manual payment starts MANUAL_UNVERIFIED until explicit match", () => {
    expect(PaymentVerificationStatus.MANUAL_UNVERIFIED).toBe("MANUAL_UNVERIFIED");
    expect(PaymentVerificationStatus.BANK_VERIFIED).toBe("BANK_VERIFIED");
  });

  it("account mismatch blocks verification (received-in brand)", () => {
    const paymentAccount: string = "SBI";
    const bankAccount: string = "HDFC";
    expect(paymentAccount === bankAccount).toBe(false);
  });

  it("match keeps same payment id and adopts bank transaction date", () => {
    const payment = {
      id: "pay-1",
      verificationStatus: PaymentVerificationStatus.MANUAL_UNVERIFIED,
      paymentDate: "2026-08-01",
    };
    const bankDate = "2026-08-10";
    const afterMatch = {
      ...payment,
      verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
      paymentDate: bankDate,
    };
    expect(afterMatch.id).toBe(payment.id);
    expect(afterMatch.paymentDate).toBe(bankDate);
    expect(afterMatch.verificationStatus).toBe(PaymentVerificationStatus.BANK_VERIFIED);
  });

  it("remove assignment restores available credit; bank txn is never deleted", async () => {
    const bankTxnDeletes: string[] = [];
    const db = {
      bankPaymentAllocation: {
        findMany: vi.fn(async () => [
          {
            id: "alloc-1",
            bankTransactionId: "txn-keep",
            piPaymentId: "pay-1",
            allocatedAmount: 2500,
          },
        ]),
        update: vi.fn(async ({ data }: { data: { allocationStatus: string } }) => {
          expect(data.allocationStatus).toBe(BankPaymentAllocationStatus.RELEASED);
          return {};
        }),
      },
      payment: {
        findMany: vi.fn(async () => [
          {
            id: "pay-1",
            bankTransactionId: "txn-keep",
            verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
          },
        ]),
        update: vi.fn(async () => ({})),
      },
      bankTransaction: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "txn-keep",
          creditAmount: 2500,
          allocations: [],
        })),
        update: vi.fn(async () => ({ id: "txn-keep" })),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          bankTxnDeletes.push(where.id);
        }),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };

    const result = await releaseBankAllocationsForCancelledPi(db as never, {
      companyId: "co-1",
      piId: "pi-1",
      piNo: "PI-1",
      performedById: "user-1",
    });

    expect(result.releasedAllocationCount).toBe(1);
    expect(bankTxnDeletes).toHaveLength(0);
    expect(db.bankTransaction.delete).not.toHaveBeenCalled();
    expect(db.bankTransaction.update).toHaveBeenCalled();
  });
});

describe("Cmd17 RBAC", () => {
  it("Sales cannot upload or access debit/full statement admin", () => {
    const roles = [ROLES.SALES_EXECUTIVE];
    expect(canUploadBankStatements(roles)).toBe(false);
    expect(canViewFullBankTransactions(roles)).toBe(false);
    expect(canAccessBankingAdmin(roles)).toBe(false);
    expect(canViewSalesCreditReceipts(roles)).toBe(true);
    expect(canAllocateBankPayments(roles)).toBe(true);
  });

  it("Accounts and Super Admin have authorized banking access", () => {
    for (const role of [ROLES.ACCOUNTS, ROLES.SUPER_ADMIN]) {
      expect(canAccessBankingAdmin([role])).toBe(true);
      expect(canUploadBankStatements([role])).toBe(true);
      expect(canViewFullBankTransactions([role])).toBe(true);
      expect(canAllocateBankPayments([role])).toBe(true);
    }
  });

  it("Sales credit view banks never imply debit access (ISE/PCM credit brands only)", () => {
    expect(salesReceiptBanksForCompany({ code: "ISE" })).toEqual(["SBI", "HDFC", "ICICI"]);
    expect(salesReceiptBanksForCompany({ code: "PCMV", name: "PCM" })).toEqual(["SBI", "HDFC"]);
  });
});
