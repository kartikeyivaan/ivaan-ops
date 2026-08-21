import {
  BankPaymentAllocationStatus,
  BankTransactionAssignmentStatus,
  PaymentVerificationStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  BANKING_AUDIT_EVENTS,
  writeBankingAuditTx,
} from "@/lib/banking-audit";
import { isValidPaymentCodeFormat } from "@/lib/bank-payment-code";
import { clearPiCreditIfPaid } from "@/lib/pi-credit-service";
import { calculateOutstanding } from "@/lib/proforma-invoices";

type Db = PrismaClient | Prisma.TransactionClient;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value);
}

export function normalizePaymentCodeInput(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export async function findCreditTransactionByPaymentCode(
  db: Db,
  companyId: string,
  paymentCodeRaw: string,
) {
  const paymentCode = normalizePaymentCodeInput(paymentCodeRaw);
  if (!isValidPaymentCodeFormat(paymentCode)) {
    throw new Error("INVALID_PAYMENT_CODE");
  }

  const txn = await db.bankTransaction.findFirst({
    where: {
      paymentCode,
      creditAmount: { gt: 0 },
      bankAccount: { companyId, isActive: true },
    },
    include: {
      bankAccount: {
        select: {
          id: true,
          companyId: true,
          bankName: true,
          receivedInAccount: true,
          accountNumberMasked: true,
        },
      },
      allocations: {
        where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
        select: { allocatedAmount: true, customerId: true, customerGstNumber: true },
      },
    },
  });

  if (!txn) throw new Error("PAYMENT_CODE_NOT_FOUND");
  return txn;
}

export function availableBankCreditAmount(txn: {
  creditAmount: Prisma.Decimal | number;
  allocations: Array<{ allocatedAmount: Prisma.Decimal | number }>;
}): number {
  const credit = decimalToNumber(txn.creditAmount);
  const allocated = txn.allocations.reduce((s, a) => s + decimalToNumber(a.allocatedAmount), 0);
  return roundMoney(Math.max(0, credit - allocated));
}

export async function recalculateBankAssignmentStatus(db: Db, bankTransactionId: string) {
  const txn = await db.bankTransaction.findUniqueOrThrow({
    where: { id: bankTransactionId },
    include: {
      allocations: {
        where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
        select: { allocatedAmount: true },
      },
    },
  });

  const credit = decimalToNumber(txn.creditAmount);
  if (credit <= 0) {
    await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { assignmentStatus: BankTransactionAssignmentStatus.NON_CUSTOMER_PAYMENT },
    });
    return;
  }

  const allocated = txn.allocations.reduce((s, a) => s + decimalToNumber(a.allocatedAmount), 0);
  const assignmentStatus = assignmentStatusFromAllocated(credit, allocated);

  await db.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { assignmentStatus },
  });
}

/**
 * Lock the bank transaction row for the duration of the allocation transaction
 * so concurrent link/match attempts cannot over-allocate the same credit.
 */
export async function lockBankTransactionForAllocation(db: Db, bankTransactionId: string) {
  await db.$executeRaw`
    SELECT id FROM bank_transactions WHERE id = ${bankTransactionId}::uuid FOR UPDATE
  `;
}

function assertSameCustomerGst(
  existingAllocations: Array<{ customerId: string; customerGstNumber: string }>,
  customerId: string,
  customerGst: string,
) {
  for (const row of existingAllocations) {
    if (row.customerId !== customerId) {
      throw new Error("DIFFERENT_CUSTOMER");
    }
    if (row.customerGstNumber.trim().toUpperCase() !== customerGst.trim().toUpperCase()) {
      throw new Error("DIFFERENT_GST");
    }
  }
}

/** Exported for allocation rule tests (Cmd 17). */
export function assertBankAllocationCustomerGst(
  existingAllocations: Array<{ customerId: string; customerGstNumber: string }>,
  customerId: string,
  customerGst: string,
) {
  return assertSameCustomerGst(existingAllocations, customerId, customerGst);
}

/** Pure assignment status from credit vs active allocated total. */
export function assignmentStatusFromAllocated(
  creditAmount: number,
  allocatedAmount: number,
): BankTransactionAssignmentStatus {
  if (creditAmount <= 0) {
    return BankTransactionAssignmentStatus.NON_CUSTOMER_PAYMENT;
  }
  if (allocatedAmount <= 0) {
    return BankTransactionAssignmentStatus.UNASSIGNED;
  }
  if (allocatedAmount + 0.005 >= creditAmount) {
    return BankTransactionAssignmentStatus.FULLY_ASSIGNED;
  }
  return BankTransactionAssignmentStatus.PARTIALLY_ASSIGNED;
}

/**
 * Validate a proposed allocation amount against bank available and PI outstanding.
 * Reduction-only vs default (min of available, outstanding).
 */
export function validateAllocationAmount(input: {
  amount: number;
  bankAvailable: number;
  piOutstanding: number;
}): void {
  const amount = roundMoney(input.amount);
  const defaultAllocation = roundMoney(
    Math.min(input.bankAvailable, input.piOutstanding),
  );
  if (amount <= 0) throw new Error("INVALID_AMOUNT");
  if (amount > defaultAllocation + 0.005) throw new Error("ALLOCATION_EXCEEDS_LIMIT");
  if (amount > input.bankAvailable + 0.005) throw new Error("ALLOCATION_EXCEEDS_BANK");
  if (amount > input.piOutstanding + 0.005) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING");
}

export async function previewBankPaymentLink(
  db: PrismaClient,
  input: { companyId: string; piId: string; paymentCode: string },
) {
  const pi = await db.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: {
      payments: true,
      customer: { select: { id: true, customerName: true, gstNumber: true } },
    },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (
    pi.status === "DRAFT" ||
    pi.status === "CANCEL_PENDING" ||
    pi.status === "CANCELLED"
  ) {
    throw new Error("INVALID_STATUS");
  }

  const txn = await findCreditTransactionByPaymentCode(db, input.companyId, input.paymentCode);
  const available = availableBankCreditAmount(txn);
  if (available <= 0) throw new Error("BANK_FULLY_ALLOCATED");

  assertSameCustomerGst(
    txn.allocations.map((a) => ({
      customerId: a.customerId,
      customerGstNumber: a.customerGstNumber,
    })),
    pi.customerId,
    pi.customer.gstNumber,
  );

  const totalPaid = pi.payments.reduce((s, p) => s + decimalToNumber(p.amount), 0);
  const outstanding = calculateOutstanding(decimalToNumber(pi.totalValue), totalPaid);
  if (outstanding <= 0) throw new Error("PI_FULLY_PAID");

  const defaultAllocation = roundMoney(Math.min(available, outstanding));

  return {
    bankTransaction: {
      id: txn.id,
      paymentCode: txn.paymentCode,
      transactionDate: txn.transactionDate.toISOString().slice(0, 10),
      description: txn.description,
      referenceNumber: txn.referenceNumber,
      creditAmount: decimalToNumber(txn.creditAmount),
      availableAmount: available,
      bankName: txn.bankAccount.bankName,
      receivedInAccount: txn.bankAccount.receivedInAccount,
      accountNumberMasked: txn.bankAccount.accountNumberMasked,
    },
    piOutstanding: outstanding,
    defaultAllocation,
  };
}

export async function linkBankPaymentToPi(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    paymentCode: string;
    amount?: number;
    recordedById: string;
  },
) {
  const preview = await previewBankPaymentLink(prisma, input);
  const amount = roundMoney(input.amount ?? preview.defaultAllocation);
  validateAllocationAmount({
    amount,
    bankAvailable: preview.bankTransaction.availableAmount,
    piOutstanding: preview.piOutstanding,
  });

  return prisma.$transaction(async (tx) => {
    const pi = await tx.proformaInvoice.findFirstOrThrow({
      where: { id: input.piId, companyId: input.companyId },
      include: {
        customer: { select: { id: true, customerName: true, gstNumber: true } },
      },
    });

    const txn = await findCreditTransactionByPaymentCode(tx, input.companyId, input.paymentCode);
    await lockBankTransactionForAllocation(tx, txn.id);
    // Re-read allocations under the lock for a concurrency-safe available check.
    const locked = await findCreditTransactionByPaymentCode(tx, input.companyId, input.paymentCode);
    const available = availableBankCreditAmount(locked);
    if (amount > available + 0.005) throw new Error("ALLOCATION_EXCEEDS_BANK");

    assertSameCustomerGst(
      locked.allocations.map((a) => ({
        customerId: a.customerId,
        customerGstNumber: a.customerGstNumber,
      })),
      pi.customerId,
      pi.customer.gstNumber,
    );

    const payment = await tx.payment.create({
      data: {
        companyId: input.companyId,
        customerId: pi.customerId,
        proformaInvoiceId: pi.id,
        amount,
        paymentDate: locked.transactionDate,
        paymentMode: "BANK_TRANSFER",
        receivedInAccount: locked.bankAccount.receivedInAccount,
        referenceNo: locked.referenceNumber || locked.paymentCode || "BANK",
        verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
        bankTransactionId: locked.id,
        recordedById: input.recordedById,
      },
    });

    await tx.bankPaymentAllocation.create({
      data: {
        bankTransactionId: locked.id,
        piPaymentId: payment.id,
        piId: pi.id,
        customerId: pi.customerId,
        customerCompanyName: pi.customer.customerName,
        customerGstNumber: pi.customer.gstNumber,
        allocatedAmount: amount,
        allocationStatus: BankPaymentAllocationStatus.ACTIVE,
        createdById: input.recordedById,
      },
    });

    await recalculateBankAssignmentStatus(tx, locked.id);

    await clearPiCreditIfPaid(tx, {
      companyId: input.companyId,
      piId: pi.id,
      performedById: input.recordedById,
    });

    await writeBankingAuditTx(tx, {
      eventType:
        amount + 0.005 < available
          ? BANKING_AUDIT_EVENTS.ALLOCATION_PARTIAL
          : BANKING_AUDIT_EVENTS.ALLOCATION_LINK,
      tableName: "payments",
      recordId: payment.id,
      action: "CREATE",
      performedBy: input.recordedById,
      companyId: input.companyId,
      reference: pi.piNo,
      newValue: {
        amount,
        verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
        bankTransactionId: locked.id,
        paymentCode: locked.paymentCode,
        bankAvailableBefore: available,
        piOutstanding: preview.piOutstanding,
      },
    });

    return payment.id;
  });
}

export async function matchManualPaymentWithBank(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    paymentId: string;
    paymentCode: string;
    performedById: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const pi = await tx.proformaInvoice.findFirst({
      where: { id: input.piId, companyId: input.companyId },
      include: {
        payments: true,
        customer: { select: { id: true, customerName: true, gstNumber: true } },
      },
    });
    if (!pi) throw new Error("NOT_FOUND");

    const payment = pi.payments.find((p) => p.id === input.paymentId);
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.verificationStatus === PaymentVerificationStatus.BANK_VERIFIED) {
      throw new Error("ALREADY_VERIFIED");
    }

    const txn = await findCreditTransactionByPaymentCode(tx, input.companyId, input.paymentCode);
    await lockBankTransactionForAllocation(tx, txn.id);
    const locked = await findCreditTransactionByPaymentCode(tx, input.companyId, input.paymentCode);
    const available = availableBankCreditAmount(locked);
    const amount = decimalToNumber(payment.amount);

    if (amount > available + 0.005) throw new Error("ALLOCATION_EXCEEDS_BANK");

    // Material mismatch: company account brand if payment has receivedInAccount
    if (
      payment.receivedInAccount &&
      payment.receivedInAccount !== locked.bankAccount.receivedInAccount
    ) {
      throw new Error("ACCOUNT_MISMATCH");
    }

    assertSameCustomerGst(
      locked.allocations.map((a) => ({
        customerId: a.customerId,
        customerGstNumber: a.customerGstNumber,
      })),
      pi.customerId,
      pi.customer.gstNumber,
    );

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
        bankTransactionId: locked.id,
        paymentDate: locked.transactionDate,
        receivedInAccount: locked.bankAccount.receivedInAccount,
        referenceNo: payment.referenceNo || locked.referenceNumber || locked.paymentCode,
      },
    });

    await tx.bankPaymentAllocation.create({
      data: {
        bankTransactionId: locked.id,
        piPaymentId: payment.id,
        piId: pi.id,
        customerId: pi.customerId,
        customerCompanyName: pi.customer.customerName,
        customerGstNumber: pi.customer.gstNumber,
        allocatedAmount: amount,
        allocationStatus: BankPaymentAllocationStatus.ACTIVE,
        createdById: input.performedById,
      },
    });

    await recalculateBankAssignmentStatus(tx, locked.id);

    await clearPiCreditIfPaid(tx, {
      companyId: input.companyId,
      piId: pi.id,
      performedById: input.performedById,
    });

    await writeBankingAuditTx(tx, {
      eventType: BANKING_AUDIT_EVENTS.MANUAL_PAYMENT_VERIFY,
      tableName: "payments",
      recordId: payment.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: pi.piNo,
      oldValue: { verificationStatus: PaymentVerificationStatus.MANUAL_UNVERIFIED },
      newValue: {
        verificationStatus: PaymentVerificationStatus.BANK_VERIFIED,
        bankTransactionId: locked.id,
        paymentCode: locked.paymentCode,
      },
    });

    return payment.id;
  });
}

export async function removeBankPaymentAssignment(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    paymentId: string;
    performedById: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        id: input.paymentId,
        proformaInvoiceId: input.piId,
        companyId: input.companyId,
      },
      include: {
        bankAllocations: {
          where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
        },
        proformaInvoice: { select: { piNo: true } },
      },
    });
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (!payment.bankTransactionId && payment.bankAllocations.length === 0) {
      throw new Error("NOT_BANK_LINKED");
    }

    const bankTransactionId = payment.bankTransactionId;

    for (const allocation of payment.bankAllocations) {
      await tx.bankPaymentAllocation.update({
        where: { id: allocation.id },
        data: {
          allocationStatus: BankPaymentAllocationStatus.RELEASED,
          releasedAt: new Date(),
          releaseReason: "Remove Assignment",
        },
      });

      await writeBankingAuditTx(tx, {
        eventType: BANKING_AUDIT_EVENTS.ALLOCATION_REMOVE,
        tableName: "bank_payment_allocations",
        recordId: allocation.id,
        action: "UPDATE",
        performedBy: input.performedById,
        companyId: input.companyId,
        reference: payment.proformaInvoice.piNo,
        oldValue: {
          allocationStatus: BankPaymentAllocationStatus.ACTIVE,
          allocatedAmount: decimalToNumber(allocation.allocatedAmount),
          bankTransactionId: allocation.bankTransactionId,
        },
        newValue: {
          allocationStatus: BankPaymentAllocationStatus.RELEASED,
        },
      });
    }

    // Keep the payment row as a manual unverified claim after unlinking.
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        bankTransactionId: null,
        verificationStatus: PaymentVerificationStatus.MANUAL_UNVERIFIED,
      },
    });

    if (bankTransactionId) {
      await recalculateBankAssignmentStatus(tx, bankTransactionId);
    }

    await writeBankingAuditTx(tx, {
      eventType: BANKING_AUDIT_EVENTS.ALLOCATION_REMOVE,
      tableName: "payments",
      recordId: payment.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: payment.proformaInvoice.piNo,
      oldValue: { bankTransactionId },
      newValue: {
        bankTransactionId: null,
        verificationStatus: PaymentVerificationStatus.MANUAL_UNVERIFIED,
      },
      reason: "Remove bank assignment",
    });

    return payment.id;
  });
}

/**
 * On PI cancel approval: release every active bank allocation for the PI,
 * unlink payments from bank transactions, restore available amounts, and
 * leave source bank transactions intact for reassignment.
 * Must run inside an existing transaction (atomic with cancel).
 */
export async function releaseBankAllocationsForCancelledPi(
  db: Db,
  input: {
    companyId: string;
    piId: string;
    piNo: string;
    performedById: string;
  },
): Promise<{ releasedAllocationCount: number; unlinkedPaymentCount: number }> {
  const allocations = await db.bankPaymentAllocation.findMany({
    where: {
      piId: input.piId,
      allocationStatus: BankPaymentAllocationStatus.ACTIVE,
      proformaInvoice: { companyId: input.companyId },
    },
    select: {
      id: true,
      bankTransactionId: true,
      piPaymentId: true,
      allocatedAmount: true,
    },
  });

  const bankTxnIds = new Set<string>();
  const paymentIdsFromAllocations = new Set<string>();

  for (const allocation of allocations) {
    await db.bankPaymentAllocation.update({
      where: { id: allocation.id },
      data: {
        allocationStatus: BankPaymentAllocationStatus.RELEASED,
        releasedAt: new Date(),
        releaseReason: "PI Cancelled",
      },
    });

    bankTxnIds.add(allocation.bankTransactionId);
    paymentIdsFromAllocations.add(allocation.piPaymentId);

    await writeBankingAuditTx(db, {
      eventType: BANKING_AUDIT_EVENTS.PI_CANCEL_RELEASE,
      tableName: "bank_payment_allocations",
      recordId: allocation.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: input.piNo,
      oldValue: {
        allocationStatus: BankPaymentAllocationStatus.ACTIVE,
        allocatedAmount: decimalToNumber(allocation.allocatedAmount),
        bankTransactionId: allocation.bankTransactionId,
        piPaymentId: allocation.piPaymentId,
      },
      newValue: {
        allocationStatus: BankPaymentAllocationStatus.RELEASED,
        releaseReason: "PI Cancelled",
      },
    });
  }

  const linkedPayments = await db.payment.findMany({
    where: {
      companyId: input.companyId,
      proformaInvoiceId: input.piId,
      OR: [
        { id: { in: [...paymentIdsFromAllocations] } },
        { bankTransactionId: { not: null } },
      ],
    },
    select: {
      id: true,
      bankTransactionId: true,
      verificationStatus: true,
    },
  });

  let unlinkedPaymentCount = 0;
  for (const payment of linkedPayments) {
    if (payment.bankTransactionId) {
      bankTxnIds.add(payment.bankTransactionId);
    }

    const needsUnlink =
      payment.bankTransactionId !== null ||
      payment.verificationStatus === PaymentVerificationStatus.BANK_VERIFIED ||
      paymentIdsFromAllocations.has(payment.id);

    if (!needsUnlink) continue;

    await db.payment.update({
      where: { id: payment.id },
      data: {
        bankTransactionId: null,
        verificationStatus: PaymentVerificationStatus.MANUAL_UNVERIFIED,
      },
    });
    unlinkedPaymentCount += 1;

    await writeBankingAuditTx(db, {
      eventType: BANKING_AUDIT_EVENTS.PI_CANCEL_RELEASE,
      tableName: "payments",
      recordId: payment.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: input.piNo,
      oldValue: {
        bankTransactionId: payment.bankTransactionId,
        verificationStatus: payment.verificationStatus,
      },
      newValue: {
        bankTransactionId: null,
        verificationStatus: PaymentVerificationStatus.MANUAL_UNVERIFIED,
      },
    });
  }

  for (const bankTransactionId of bankTxnIds) {
    await recalculateBankAssignmentStatus(db, bankTransactionId);
  }

  return {
    releasedAllocationCount: allocations.length,
    unlinkedPaymentCount,
  };
}
