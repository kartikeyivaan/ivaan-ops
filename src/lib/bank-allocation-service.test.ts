import { describe, expect, it, vi } from "vitest";
import {
  BankPaymentAllocationStatus,
  PaymentVerificationStatus,
} from "@prisma/client";
import {
  generatePaymentCodeCandidate,
  isValidPaymentCodeFormat,
} from "@/lib/bank-payment-code";
import {
  availableBankCreditAmount,
  normalizePaymentCodeInput,
  releaseBankAllocationsForCancelledPi,
} from "@/lib/bank-allocation-service";

describe("bank payment codes", () => {
  it("generates P-prefixed codes without ambiguous characters", () => {
    for (let i = 0; i < 40; i += 1) {
      const code = generatePaymentCodeCandidate();
      expect(code).toHaveLength(6);
      expect(code.startsWith("P")).toBe(true);
      expect(isValidPaymentCodeFormat(code)).toBe(true);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it("rejects invalid payment code formats", () => {
    expect(isValidPaymentCodeFormat("P8K4X2")).toBe(true);
    expect(isValidPaymentCodeFormat("p8k4x2")).toBe(false);
    expect(isValidPaymentCodeFormat("P8K4O2")).toBe(false);
    expect(isValidPaymentCodeFormat("P8K41X")).toBe(false);
    expect(isValidPaymentCodeFormat("X8K4X2")).toBe(false);
    expect(isValidPaymentCodeFormat("P8K4X")).toBe(false);
  });

  it("normalizes pasted payment codes", () => {
    expect(normalizePaymentCodeInput(" p8k4x2 ")).toBe("P8K4X2");
    expect(normalizePaymentCodeInput("P8 K4 X2")).toBe("P8K4X2");
  });
});

describe("availableBankCreditAmount", () => {
  it("subtracts only active allocations from credit", () => {
    expect(
      availableBankCreditAmount({
        creditAmount: 10000,
        allocations: [{ allocatedAmount: 2500 }, { allocatedAmount: 1500 }],
      }),
    ).toBe(6000);
  });

  it("never returns negative available", () => {
    expect(
      availableBankCreditAmount({
        creditAmount: 1000,
        allocations: [{ allocatedAmount: 1500 }],
      }),
    ).toBe(0);
  });
});

describe("releaseBankAllocationsForCancelledPi", () => {
  it("releases active allocations, unlinks payments, and audits PI Cancelled", async () => {
    const allocationUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const paymentUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const audits: Array<{ tableName: string; reason: string | null | undefined }> = [];

    const db = {
      bankPaymentAllocation: {
        findMany: vi.fn(async () => [
          {
            id: "alloc-1",
            bankTransactionId: "txn-1",
            piPaymentId: "pay-1",
            allocatedAmount: 5000,
          },
          {
            id: "alloc-2",
            bankTransactionId: "txn-1",
            piPaymentId: "pay-2",
            allocatedAmount: 2500,
          },
        ]),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            allocationUpdates.push({ id: where.id, data });
            return { id: where.id, ...data };
          },
        ),
      },
      payment: {
        findMany: vi.fn(async () => [
          {
            id: "pay-1",
            bankTransactionId: "txn-1",
            verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
          },
          {
            id: "pay-2",
            bankTransactionId: "txn-1",
            verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
          },
        ]),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            paymentUpdates.push({ id: where.id, data });
            return { id: where.id, ...data };
          },
        ),
      },
      bankTransaction: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "txn-1",
          creditAmount: 10000,
          allocations: [],
        })),
        update: vi.fn(async () => ({ id: "txn-1" })),
      },
      auditLog: {
        create: vi.fn(
          async ({
            data,
          }: {
            data: { tableName: string; reason?: string | null };
          }) => {
            audits.push({ tableName: data.tableName, reason: data.reason });
            return { id: "audit-1", ...data };
          },
        ),
      },
    };

    const result = await releaseBankAllocationsForCancelledPi(db as never, {
      companyId: "co-1",
      piId: "pi-1",
      piNo: "PI-001",
      performedById: "user-1",
    });

    expect(result.releasedAllocationCount).toBe(2);
    expect(result.unlinkedPaymentCount).toBe(2);

    expect(allocationUpdates).toHaveLength(2);
    for (const row of allocationUpdates) {
      expect(row.data.allocationStatus).toBe(BankPaymentAllocationStatus.RELEASED);
      expect(row.data.releaseReason).toBe("PI Cancelled");
    }

    expect(paymentUpdates).toHaveLength(2);
    for (const row of paymentUpdates) {
      expect(row.data.bankTransactionId).toBeNull();
      expect(row.data.verificationStatus).toBe(
        PaymentVerificationStatus.MANUAL_UNVERIFIED,
      );
    }

    const cancelAudits = audits.filter((a) => a.reason === "PI Cancelled");
    expect(cancelAudits.length).toBeGreaterThanOrEqual(4);
    expect(cancelAudits.some((a) => a.tableName === "bank_payment_allocations")).toBe(
      true,
    );
    expect(cancelAudits.some((a) => a.tableName === "payments")).toBe(true);

    // Source bank txn is recalculated to UNASSIGNED (no active allocations), not deleted.
    expect(db.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "txn-1" },
        data: { assignmentStatus: "UNASSIGNED" },
      }),
    );
  });

  it("is a no-op when the PI has no active bank allocations", async () => {
    const db = {
      bankPaymentAllocation: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
      },
      payment: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
      },
      bankTransaction: {
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    };

    const result = await releaseBankAllocationsForCancelledPi(db as never, {
      companyId: "co-1",
      piId: "pi-1",
      piNo: "PI-001",
      performedById: "user-1",
    });

    expect(result).toEqual({ releasedAllocationCount: 0, unlinkedPaymentCount: 0 });
    expect(db.bankPaymentAllocation.update).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
  });
});
