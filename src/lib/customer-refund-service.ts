import {
  BankPaymentAllocationStatus,
  BankTransactionAssignmentStatus,
  CustomerRefundReason,
  CustomerRefundStatus,
  PaymentMode,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { maskBankAccountNumber } from "@/lib/bank-account-service";
import {
  findCreditTransactionByPaymentCode,
  normalizePaymentCodeInput,
} from "@/lib/bank-allocation-service";
import {
  CUSTOMER_REFUND_REASON_LABELS,
  CUSTOMER_REFUND_STATUS_LABELS,
  DOCUMENT_TYPE_CUSTOMER_REFUND,
  isCustomerRefundLocked,
} from "@/lib/customer-refund-constants";
import {
  REFUND_AUDIT_EVENTS,
  REFUND_AUDIT_REASONS,
  refundAuditEventType,
  writeRefundAuditTx,
} from "@/lib/customer-refund-audit";
import { decimalToNumber, getFinancialYear } from "@/lib/inventory";
import {
  notifyRefundApprovalNeeded,
  notifyRefundDecided,
  notifyRefundExecutionNeeded,
  notifyRefundCompleted,
} from "@/lib/notification-service";

type Db = PrismaClient | Prisma.TransactionClient;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Uppercase, no spaces. Matches how banks print UTRs. */
export function normalizeUtr(utr: string): string {
  return utr.trim().toUpperCase().replace(/\s+/g, "");
}

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function normalizeIfsc(ifsc: string): string {
  return ifsc.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidIfsc(ifsc: string): boolean {
  return IFSC_PATTERN.test(normalizeIfsc(ifsc));
}

export function normalizeAccountNumber(accountNumber: string): string {
  return accountNumber.replace(/\s+/g, "").trim();
}

/** Indian bank account numbers are 9–18 digits. */
export function isValidRefundAccountNumber(accountNumber: string): boolean {
  return /^\d{9,18}$/.test(normalizeAccountNumber(accountNumber));
}

// ─── Refundable amount math ─────────────────────────────────────────────────

/**
 * Refunds that are still in flight reserve headroom on the receipt so two
 * requests cannot each claim the full balance. Terminal-negative statuses
 * (REJECTED / CANCELLED) release their reservation; FAILED stays reserved
 * because Accounts may still retry it.
 */
export const RESERVING_REFUND_STATUSES: CustomerRefundStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PROCESSING",
  "FAILED",
];

export type RefundAmountSummary = {
  receivedAmount: number;
  /** Actually paid out on completed refunds. */
  previousRefundedAmount: number;
  /** Held by in-flight requests (excluding the one being edited). */
  reservedAmount: number;
  availableRefundAmount: number;
};

type RefundAmountRow = {
  id: string;
  status: CustomerRefundStatus;
  requestedAmount: Prisma.Decimal | number;
  approvedAmount: Prisma.Decimal | number | null;
  actualRefundAmount: Prisma.Decimal | number | null;
};

/** The amount a given refund currently ties up on the receipt. */
function refundHeldAmount(row: RefundAmountRow): number {
  if (row.status === "REFUNDED") {
    return decimalToNumber(row.actualRefundAmount ?? row.approvedAmount ?? row.requestedAmount);
  }
  return decimalToNumber(row.approvedAmount ?? row.requestedAmount);
}

export function summarizeRefundableAmount(
  receivedAmount: number,
  refunds: RefundAmountRow[],
  options?: { excludeRefundId?: string },
): RefundAmountSummary {
  let previousRefundedAmount = 0;
  let reservedAmount = 0;

  for (const row of refunds) {
    if (options?.excludeRefundId && row.id === options.excludeRefundId) continue;
    if (row.status === "REFUNDED") {
      previousRefundedAmount += refundHeldAmount(row);
      continue;
    }
    if (RESERVING_REFUND_STATUSES.includes(row.status)) {
      reservedAmount += refundHeldAmount(row);
    }
  }

  previousRefundedAmount = roundMoney(previousRefundedAmount);
  reservedAmount = roundMoney(reservedAmount);

  return {
    receivedAmount: roundMoney(receivedAmount),
    previousRefundedAmount,
    reservedAmount,
    availableRefundAmount: roundMoney(
      Math.max(0, receivedAmount - previousRefundedAmount - reservedAmount),
    ),
  };
}

/** Add extra linked receipts into one combined refundable cap. */
export function combineRefundAmountSummaries(
  summaries: RefundAmountSummary[],
): RefundAmountSummary {
  const receivedAmount = roundMoney(
    summaries.reduce((sum, row) => sum + row.receivedAmount, 0),
  );
  const previousRefundedAmount = roundMoney(
    summaries.reduce((sum, row) => sum + row.previousRefundedAmount, 0),
  );
  const reservedAmount = roundMoney(
    summaries.reduce((sum, row) => sum + row.reservedAmount, 0),
  );
  return {
    receivedAmount,
    previousRefundedAmount,
    reservedAmount,
    availableRefundAmount: roundMoney(
      Math.max(0, receivedAmount - previousRefundedAmount - reservedAmount),
    ),
  };
}

/** True when this payout consumes the remaining headroom on the attached receipts. */
export function shouldMarkAttachedReceiptsReturned(
  actualRefundAmount: number,
  availableRefundAmount: number,
): boolean {
  return roundMoney(actualRefundAmount) + 0.005 >= roundMoney(availableRefundAmount);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

async function lockBankTransactions(db: Db, bankTransactionIds: string[]) {
  for (const id of [...uniqueIds(bankTransactionIds)].sort()) {
    await db.$executeRaw`
      SELECT id FROM bank_transactions WHERE id = ${id}::uuid FOR UPDATE
    `;
  }
}

const refundAmountSelect = {
  id: true,
  status: true,
  requestedAmount: true,
  approvedAmount: true,
  actualRefundAmount: true,
} as const;

/**
 * Refundable headroom across one or more credit receipts. A combined refund
 * (original payment + extra linked receipts) uses the pooled total so multiple
 * orders can be returned together.
 */
async function loadRefundableAmountForReceipts(
  db: Db,
  bankTransactionIds: string[],
  excludeRefundId?: string,
): Promise<RefundAmountSummary> {
  const unique = uniqueIds(bankTransactionIds);
  if (unique.length === 0) {
    return summarizeRefundableAmount(0, []);
  }

  const txns = await db.bankTransaction.findMany({
    where: { id: { in: unique } },
    select: { id: true, creditAmount: true },
  });
  const receivedAmount = roundMoney(
    txns.reduce((sum, row) => sum + decimalToNumber(row.creditAmount), 0),
  );

  const refunds = await db.customerRefund.findMany({
    where: {
      OR: [
        { bankTransactionId: { in: unique } },
        { transactionReferences: { some: { bankTransactionId: { in: unique } } } },
      ],
    },
    select: refundAmountSelect,
  });

  return summarizeRefundableAmount(receivedAmount, refunds, { excludeRefundId });
}

async function loadRefundReceiptIds(
  db: Db,
  refund: { id: string; bankTransactionId: string },
): Promise<string[]> {
  const refs = await db.customerRefundTransactionReference.findMany({
    where: { refundId: refund.id },
    select: { bankTransactionId: true },
  });
  return uniqueIds([
    refund.bankTransactionId,
    ...refs.map((row) => row.bankTransactionId),
  ]);
}

async function markReceiptsReturned(db: Db, bankTransactionIds: string[]) {
  const unique = uniqueIds(bankTransactionIds);
  if (unique.length === 0) return;
  await db.bankTransaction.updateMany({
    where: { id: { in: unique } },
    data: { assignmentStatus: BankTransactionAssignmentStatus.RETURNED },
  });
}

// ─── Refund number ──────────────────────────────────────────────────────────

export async function generateRefundNumber(
  db: Db,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = DOCUMENT_TYPE_CUSTOMER_REFUND;

  const existing = await db.documentSequence.findUnique({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
  });

  const nextSeq = (existing?.lastSequence ?? 0) + 1;

  await db.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
    create: {
      companyId,
      documentType: docType,
      financialYear: fy,
      lastSequence: nextSeq,
    },
    update: { lastSequence: nextSeq },
  });

  return `${companyCode}-RF-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

// ─── Verify & fetch payment ─────────────────────────────────────────────────

export type VerifiedRefundPayment = {
  verificationCode: string;
  bankTransactionId: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  /** Null when the receipt was never allocated to a PI; the SE then picks the customer. */
  customerId: string | null;
  customerName: string | null;
  customerCode: string | null;
  customerGstNumber: string | null;
  customerSource: "PAYMENT_DATA" | "MANUAL_REQUIRED";
  receivedAmount: number;
  paymentDate: string;
  bankName: string;
  bankAccountMasked: string;
  transactionReference: string | null;
  description: string;
  assignmentStatus: string;
  piNumbers: string[];
  /** PI-side Payment rows behind this receipt (read-only context). */
  payments: Array<{
    id: string;
    piNo: string;
    amount: number;
    paymentDate: string;
    paymentMode: PaymentMode;
    verificationStatus: string;
  }>;
  amounts: RefundAmountSummary;
  existingRefundBankAccounts: SerializedRefundBankAccount[];
};

export type SerializedRefundBankAccount = {
  id: string;
  customerId: string;
  accountHolderName: string;
  accountNumberMasked: string;
  ifscCode: string;
  bankName: string;
  usageCount: number;
  lastUsedAt: string | null;
};

function serializeRefundBankAccount(row: {
  id: string;
  customerId: string;
  accountHolderName: string;
  accountNumberMasked: string;
  ifscCode: string;
  bankName: string;
  usageCount: number;
  lastUsedAt: Date | null;
}): SerializedRefundBankAccount {
  return {
    id: row.id,
    customerId: row.customerId,
    accountHolderName: row.accountHolderName,
    accountNumberMasked: row.accountNumberMasked,
    ifscCode: row.ifscCode,
    bankName: row.bankName,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listCustomerRefundBankAccounts(
  db: Db,
  customerId: string,
): Promise<SerializedRefundBankAccount[]> {
  const rows = await db.customerRefundBankAccount.findMany({
    where: { customerId, isActive: true },
    orderBy: [{ usageCount: "desc" }, { lastUsedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeRefundBankAccount);
}

/**
 * Resolve an existing Bank Transaction Verification Code (BankTransaction.paymentCode)
 * into the received-payment context a refund request needs.
 *
 * Reuses findCreditTransactionByPaymentCode from the banking module — no second
 * verification system, and the firm check there guarantees the code belongs to
 * the selected firm.
 */
export async function verifyRefundPayment(
  db: PrismaClient,
  input: { companyId: string; verificationCode: string },
): Promise<VerifiedRefundPayment> {
  const txn = await findCreditTransactionByPaymentCode(
    db,
    input.companyId,
    input.verificationCode,
  );

  const company = await db.company.findUniqueOrThrow({
    where: { id: input.companyId },
    select: { id: true, name: true, code: true },
  });

  // Customer identity comes from the bank allocation snapshot, never typed in.
  const allocations = await db.bankPaymentAllocation.findMany({
    where: {
      bankTransactionId: txn.id,
      allocationStatus: BankPaymentAllocationStatus.ACTIVE,
    },
    include: {
      customer: { select: { id: true, customerCode: true, customerName: true, gstNumber: true } },
      proformaInvoice: { select: { id: true, piNo: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const payments = await db.payment.findMany({
    where: { bankTransactionId: txn.id },
    include: { proformaInvoice: { select: { piNo: true } } },
    orderBy: { paymentDate: "asc" },
  });

  const customer = allocations[0]?.customer ?? null;
  const piNumbers = [
    ...new Set(allocations.map((row) => row.proformaInvoice.piNo)),
  ];

  if (txn.assignmentStatus === BankTransactionAssignmentStatus.RETURNED) {
    throw new Error("PAYMENT_ALREADY_RETURNED");
  }

  const receivedAmount = decimalToNumber(txn.creditAmount);
  const amounts = await loadRefundableAmountForReceipts(db, [txn.id]);

  return {
    verificationCode: normalizePaymentCodeInput(input.verificationCode),
    bankTransactionId: txn.id,
    companyId: company.id,
    companyName: company.name,
    companyCode: company.code,
    customerId: customer?.id ?? null,
    customerName: customer?.customerName ?? null,
    customerCode: customer?.customerCode ?? null,
    customerGstNumber: customer?.gstNumber ?? null,
    customerSource: customer ? "PAYMENT_DATA" : "MANUAL_REQUIRED",
    receivedAmount,
    paymentDate: txn.transactionDate.toISOString().slice(0, 10),
    bankName: txn.bankAccount.bankName,
    bankAccountMasked: txn.bankAccount.accountNumberMasked,
    transactionReference: txn.referenceNumber,
    description: txn.description,
    assignmentStatus: txn.assignmentStatus,
    piNumbers,
    payments: payments.map((row) => ({
      id: row.id,
      piNo: row.proformaInvoice.piNo,
      amount: decimalToNumber(row.amount),
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      paymentMode: row.paymentMode,
      verificationStatus: row.verificationStatus,
    })),
    amounts,
    existingRefundBankAccounts: customer
      ? await listCustomerRefundBankAccounts(db, customer.id)
      : [],
  };
}

// ─── Bank transaction references ────────────────────────────────────────────

export type SerializedRefundTransactionReference = {
  id: string;
  bankTransactionId: string;
  bankName: string;
  bankAccountMasked: string;
  transactionReference: string | null;
  transactionDate: string;
  description: string;
  amount: number;
  isCredit: boolean;
  assignmentStatus: string;
  piNumbers: string[];
};

export type RefundBankTransactionOption = {
  id: string;
  bankName: string;
  bankAccountMasked: string;
  transactionReference: string | null;
  transactionDate: string;
  description: string;
  amount: number;
  isCredit: boolean;
  receivedAmount: number;
  previousRefundedAmount: number;
  reservedAmount: number;
  availableRefundAmount: number;
  assignmentStatus: string;
  piNumbers: string[];
  paymentCode: string | null;
};

/**
 * Search existing credit receipts of the firm so they can be attached as extra
 * orders/payments on a combined refund. Debits and already-returned receipts
 * are excluded. Read-only — the refund flow never creates a bank transaction.
 */
export async function searchRefundBankTransactions(
  db: Db,
  input: {
    companyId: string;
    search?: string;
    limit?: number;
    excludeBankTransactionIds?: string[];
  },
): Promise<RefundBankTransactionOption[]> {
  const search = input.search?.trim();
  const exclude = uniqueIds(input.excludeBankTransactionIds ?? []);

  const rows = await db.bankTransaction.findMany({
    where: {
      bankAccount: { companyId: input.companyId },
      creditAmount: { gt: 0 },
      assignmentStatus: { not: BankTransactionAssignmentStatus.RETURNED },
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
      ...(search
        ? {
            OR: [
              { referenceNumber: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { paymentCode: { contains: search.toUpperCase() } },
            ],
          }
        : {}),
    },
    include: {
      bankAccount: { select: { bankName: true, accountNumberMasked: true, companyId: true } },
      allocations: {
        where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
        select: { proformaInvoice: { select: { piNo: true } } },
      },
    },
    orderBy: [{ transactionDate: "desc" }, { statementSequence: "desc" }],
    take: Math.min(input.limit ?? 25, 100),
  });

  const ids = rows.map((row) => row.id);
  const refunds =
    ids.length === 0
      ? []
      : await db.customerRefund.findMany({
          where: {
            OR: [
              { bankTransactionId: { in: ids } },
              { transactionReferences: { some: { bankTransactionId: { in: ids } } } },
            ],
          },
          select: {
            ...refundAmountSelect,
            bankTransactionId: true,
            transactionReferences: { select: { bankTransactionId: true } },
          },
        });

  return rows.map((row) => {
    const receivedAmount = decimalToNumber(row.creditAmount);
    const touching = refunds.filter(
      (refund) =>
        refund.bankTransactionId === row.id ||
        refund.transactionReferences.some((ref) => ref.bankTransactionId === row.id),
    );
    const amounts = summarizeRefundableAmount(receivedAmount, touching);
    return {
      id: row.id,
      bankName: row.bankAccount.bankName,
      bankAccountMasked: row.bankAccount.accountNumberMasked,
      transactionReference: row.referenceNumber,
      transactionDate: row.transactionDate.toISOString().slice(0, 10),
      description: row.description,
      amount: receivedAmount,
      isCredit: true,
      receivedAmount: amounts.receivedAmount,
      previousRefundedAmount: amounts.previousRefundedAmount,
      reservedAmount: amounts.reservedAmount,
      availableRefundAmount: amounts.availableRefundAmount,
      assignmentStatus: row.assignmentStatus,
      piNumbers: [
        ...new Set(row.allocations.map((allocation) => allocation.proformaInvoice.piNo)),
      ],
      paymentCode: row.paymentCode,
    };
  });
}

/**
 * Extra linked receipts must be existing credit transactions of this firm,
 * not already returned, and not the original verified payment.
 */
async function assertValidTransactionReferences(
  db: Db,
  companyId: string,
  bankTransactionIds: string[],
  originalBankTransactionId: string,
): Promise<string[]> {
  const unique = uniqueIds(bankTransactionIds).filter(
    (id) => id !== originalBankTransactionId,
  );
  if (unique.length === 0) return [];

  const rows = await db.bankTransaction.findMany({
    where: {
      id: { in: unique },
      bankAccount: { companyId },
    },
    select: { id: true, creditAmount: true, assignmentStatus: true },
  });

  if (rows.length !== unique.length) {
    throw new Error("INVALID_TRANSACTION_REFERENCE");
  }
  for (const row of rows) {
    if (decimalToNumber(row.creditAmount) <= 0) {
      throw new Error("TRANSACTION_REFERENCE_NOT_CREDIT");
    }
    if (row.assignmentStatus === BankTransactionAssignmentStatus.RETURNED) {
      throw new Error("TRANSACTION_ALREADY_RETURNED");
    }
  }
  return unique;
}

// ─── Serialization ──────────────────────────────────────────────────────────

const refundInclude = {
  company: { select: { id: true, name: true, code: true } },
  customer: {
    select: { id: true, customerCode: true, customerName: true, gstNumber: true },
  },
  bankTransaction: {
    select: {
      id: true,
      transactionDate: true,
      creditAmount: true,
      referenceNumber: true,
      description: true,
      paymentCode: true,
      assignmentStatus: true,
      bankAccount: { select: { bankName: true, accountNumberMasked: true } },
    },
  },
  refundBankAccount: true,
  refundFromBankAccount: {
    select: {
      id: true,
      companyId: true,
      bankName: true,
      accountName: true,
      accountNumberMasked: true,
      ifscCode: true,
    },
  },
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  rejectedBy: { select: { id: true, name: true } },
  returnedForCorrectionBy: { select: { id: true, name: true } },
  processedBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  transactionReferences: {
    include: {
      bankTransaction: {
        select: {
          id: true,
          transactionDate: true,
          referenceNumber: true,
          description: true,
          debitAmount: true,
          creditAmount: true,
          assignmentStatus: true,
          bankAccount: { select: { bankName: true, accountNumberMasked: true } },
          allocations: {
            where: { allocationStatus: BankPaymentAllocationStatus.ACTIVE },
            select: { proformaInvoice: { select: { piNo: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type RefundRecord = Prisma.CustomerRefundGetPayload<{ include: typeof refundInclude }>;

export type SerializedCustomerRefund = {
  id: string;
  refundNumber: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  customerGstNumber: string;
  verificationCode: string;
  bankTransactionId: string;
  piNumber: string | null;
  receivedAmount: number;
  requestedAmount: number;
  approvedAmount: number | null;
  actualRefundAmount: number | null;
  reason: CustomerRefundReason;
  reasonLabel: string;
  remarks: string | null;
  status: CustomerRefundStatus;
  statusLabel: string;
  isLocked: boolean;

  originalPayment: {
    verificationCode: string | null;
    receivedAmount: number;
    paymentDate: string;
    bankName: string;
    bankAccountMasked: string;
    transactionReference: string | null;
    description: string;
    assignmentStatus: string;
  };

  refundBankAccount: {
    id: string;
    accountHolderName: string;
    accountNumber: string;
    accountNumberMasked: string;
    ifscCode: string;
    bankName: string;
    usageCount: number;
    lastUsedAt: string | null;
  } | null;

  transactionReferences: SerializedRefundTransactionReference[];
  totalLinkedTransactions: number;
  linkedTransactionsAmount: number;
  combinedReceivedAmount: number;

  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  submittedAt: string | null;

  approvedByName: string | null;
  approvedAt: string | null;
  approvalRemarks: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  returnedForCorrectionByName: string | null;
  returnedForCorrectionAt: string | null;
  returnedForCorrectionReason: string | null;

  processedByName: string | null;
  processedAt: string | null;
  refundDate: string | null;
  refundFromBankAccount: {
    id: string;
    bankName: string;
    accountName: string;
    accountNumberMasked: string;
    ifscCode: string | null;
  } | null;
  refundPaymentMode: PaymentMode | null;
  utrNumber: string | null;
  processingRemarks: string | null;
  failureReason: string | null;

  cancelledByName: string | null;
  cancelledAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export function serializeCustomerRefund(row: RefundRecord): SerializedCustomerRefund {
  const references: SerializedRefundTransactionReference[] = row.transactionReferences.map(
    (ref) => {
      const credit = decimalToNumber(ref.bankTransaction.creditAmount);
      const debit = decimalToNumber(ref.bankTransaction.debitAmount);
      return {
        id: ref.id,
        bankTransactionId: ref.bankTransactionId,
        bankName: ref.bankTransaction.bankAccount.bankName,
        bankAccountMasked: ref.bankTransaction.bankAccount.accountNumberMasked,
        transactionReference: ref.bankTransaction.referenceNumber,
        transactionDate: ref.bankTransaction.transactionDate.toISOString().slice(0, 10),
        description: ref.bankTransaction.description,
        amount: credit > 0 ? credit : debit,
        isCredit: credit > 0,
        assignmentStatus: ref.bankTransaction.assignmentStatus,
        piNumbers: [
          ...new Set(
            ref.bankTransaction.allocations.map(
              (allocation) => allocation.proformaInvoice.piNo,
            ),
          ),
        ],
      };
    },
  );

  const originalReceived = decimalToNumber(row.bankTransaction.creditAmount);
  const linkedTransactionsAmount = roundMoney(
    references.reduce((sum, ref) => sum + ref.amount, 0),
  );

  return {
    id: row.id,
    refundNumber: row.refundNumber,
    companyId: row.companyId,
    companyName: row.company.name,
    companyCode: row.company.code,
    customerId: row.customerId,
    customerName: row.customer.customerName,
    customerCode: row.customer.customerCode,
    customerGstNumber: row.customer.gstNumber,
    verificationCode: row.verificationCode,
    bankTransactionId: row.bankTransactionId,
    piNumber: row.piNumber,
    receivedAmount: decimalToNumber(row.receivedAmount),
    requestedAmount: decimalToNumber(row.requestedAmount),
    approvedAmount: row.approvedAmount === null ? null : decimalToNumber(row.approvedAmount),
    actualRefundAmount:
      row.actualRefundAmount === null ? null : decimalToNumber(row.actualRefundAmount),
    reason: row.reason,
    reasonLabel: CUSTOMER_REFUND_REASON_LABELS[row.reason],
    remarks: row.remarks,
    status: row.status,
    statusLabel: CUSTOMER_REFUND_STATUS_LABELS[row.status],
    isLocked: isCustomerRefundLocked(row.status),

    originalPayment: {
      verificationCode: row.bankTransaction.paymentCode,
      receivedAmount: originalReceived,
      paymentDate: row.bankTransaction.transactionDate.toISOString().slice(0, 10),
      bankName: row.bankTransaction.bankAccount.bankName,
      bankAccountMasked: row.bankTransaction.bankAccount.accountNumberMasked,
      transactionReference: row.bankTransaction.referenceNumber,
      description: row.bankTransaction.description,
      assignmentStatus: row.bankTransaction.assignmentStatus,
    },

    refundBankAccount: row.refundBankAccount
      ? {
          id: row.refundBankAccount.id,
          accountHolderName: row.refundBankAccount.accountHolderName,
          accountNumber: row.refundBankAccount.accountNumber,
          accountNumberMasked: row.refundBankAccount.accountNumberMasked,
          ifscCode: row.refundBankAccount.ifscCode,
          bankName: row.refundBankAccount.bankName,
          usageCount: row.refundBankAccount.usageCount,
          lastUsedAt: row.refundBankAccount.lastUsedAt?.toISOString() ?? null,
        }
      : null,

    transactionReferences: references,
    totalLinkedTransactions: references.length,
    linkedTransactionsAmount,
    combinedReceivedAmount: roundMoney(originalReceived + linkedTransactionsAmount),

    requestedById: row.requestedById,
    requestedByName: row.requestedBy.name,
    requestedAt: row.requestedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,

    approvedByName: row.approvedBy?.name ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvalRemarks: row.approvalRemarks,
    rejectedByName: row.rejectedBy?.name ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    returnedForCorrectionByName: row.returnedForCorrectionBy?.name ?? null,
    returnedForCorrectionAt: row.returnedForCorrectionAt?.toISOString() ?? null,
    returnedForCorrectionReason: row.returnedForCorrectionReason,

    processedByName: row.processedBy?.name ?? null,
    processedAt: row.processedAt?.toISOString() ?? null,
    refundDate: row.refundDate?.toISOString().slice(0, 10) ?? null,
    refundFromBankAccount: row.refundFromBankAccount
      ? {
          id: row.refundFromBankAccount.id,
          bankName: row.refundFromBankAccount.bankName,
          accountName: row.refundFromBankAccount.accountName,
          accountNumberMasked: row.refundFromBankAccount.accountNumberMasked,
          ifscCode: row.refundFromBankAccount.ifscCode,
        }
      : null,
    refundPaymentMode: row.refundPaymentMode,
    utrNumber: row.utrNumber,
    processingRemarks: row.processingRemarks,
    failureReason: row.failureReason,

    cancelledByName: row.cancelledBy?.name ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Queries ────────────────────────────────────────────────────────────────

export type ListCustomerRefundsFilters = {
  companyIds: string[];
  companyId?: string;
  status?: CustomerRefundStatus;
  statuses?: CustomerRefundStatus[];
  customerId?: string;
  requestedById?: string;
  approvedById?: string;
  reason?: CustomerRefundReason;
  fromDate?: Date;
  toDate?: Date;
  search?: string;
  /** Restrict to the caller's own requests (Sales Executive). */
  ownRequestsOnlyForUserId?: string;
};

export async function listCustomerRefunds(
  db: Db,
  filters: ListCustomerRefundsFilters,
): Promise<SerializedCustomerRefund[]> {
  if (filters.companyIds.length === 0) return [];

  const companyIds = filters.companyId
    ? filters.companyIds.filter((id) => id === filters.companyId)
    : filters.companyIds;
  if (companyIds.length === 0) return [];

  const search = filters.search?.trim();

  const rows = await db.customerRefund.findMany({
    where: {
      companyId: { in: companyIds },
      ...(filters.statuses?.length
        ? { status: { in: filters.statuses } }
        : filters.status
          ? { status: filters.status }
          : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.reason ? { reason: filters.reason } : {}),
      ...(filters.approvedById ? { approvedById: filters.approvedById } : {}),
      ...(filters.ownRequestsOnlyForUserId
        ? { requestedById: filters.ownRequestsOnlyForUserId }
        : filters.requestedById
          ? { requestedById: filters.requestedById }
          : {}),
      ...(filters.fromDate || filters.toDate
        ? {
            requestedAt: {
              ...(filters.fromDate ? { gte: filters.fromDate } : {}),
              ...(filters.toDate ? { lte: filters.toDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { refundNumber: { contains: search, mode: "insensitive" as const } },
              { piNumber: { contains: search, mode: "insensitive" as const } },
              { utrNumber: { contains: search, mode: "insensitive" as const } },
              { verificationCode: { contains: search.toUpperCase() } },
              {
                customer: {
                  customerName: { contains: search, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    },
    include: refundInclude,
    orderBy: { requestedAt: "desc" },
  });

  return rows.map(serializeCustomerRefund);
}

export async function getCustomerRefund(
  db: Db,
  id: string,
): Promise<SerializedCustomerRefund | null> {
  const row = await db.customerRefund.findUnique({ where: { id }, include: refundInclude });
  return row ? serializeCustomerRefund(row) : null;
}

export type RefundActivityEntry = {
  id: string;
  eventType: string | null;
  label: string;
  performedByName: string | null;
  performedByRoles: string[];
  performedAt: string;
  remarks: string | null;
  details: Record<string, unknown> | null;
};

/** Timeline for the detail page, read from the shared AuditLog table. */
export async function getCustomerRefundActivity(
  db: Db,
  refundId: string,
): Promise<RefundActivityEntry[]> {
  const rows = await db.auditLog.findMany({
    where: { tableName: "customer_refunds", recordId: refundId },
    include: { performer: { select: { name: true } } },
    orderBy: { performedAt: "asc" },
  });

  return rows.map((row) => {
    const payload =
      row.newValue && typeof row.newValue === "object" && !Array.isArray(row.newValue)
        ? (row.newValue as Record<string, unknown>)
        : null;
    const eventType = refundAuditEventType({ reason: row.reason, newValue: row.newValue });
    return {
      id: row.id,
      eventType,
      label: row.reason ?? (eventType ? REFUND_AUDIT_REASONS[eventType] : "Updated"),
      performedByName: row.performer?.name ?? null,
      performedByRoles: Array.isArray(payload?.performedByRoles)
        ? (payload.performedByRoles as string[])
        : [],
      performedAt: row.performedAt.toISOString(),
      remarks: typeof payload?.remarks === "string" ? payload.remarks : null,
      details: payload,
    };
  });
}

/** Firm payout accounts, most-used first (firm refund bank-account memory). */
export async function listFirmRefundBankAccounts(db: Db, companyId: string) {
  const rows = await db.bankAccount.findMany({
    where: { companyId, isActive: true },
    orderBy: [
      { refundUsageCount: "desc" },
      { lastRefundUsedAt: "desc" },
      { bankName: "asc" },
    ],
  });
  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumberMasked: row.accountNumberMasked,
    ifscCode: row.ifscCode,
    refundUsageCount: row.refundUsageCount,
    lastRefundUsedAt: row.lastRefundUsedAt?.toISOString() ?? null,
  }));
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export type RefundBankAccountInput =
  | { mode: "EXISTING"; refundBankAccountId: string }
  | {
      mode: "NEW";
      accountHolderName: string;
      accountNumber: string;
      ifscCode: string;
      bankName: string;
    };

export type CreateCustomerRefundInput = {
  companyId: string;
  verificationCode: string;
  /** Required only when the receipt has no allocated customer. */
  customerId?: string | null;
  piNumber?: string | null;
  requestedAmount: number;
  reason: CustomerRefundReason;
  remarks?: string | null;
  bankTransactionIds: string[];
  refundBankAccount: RefundBankAccountInput;
  /** Submit for approval immediately instead of saving a draft. */
  submit: boolean;
  actorUserId: string;
  actorRoles: string[];
};

function assertReasonRemarks(reason: CustomerRefundReason, remarks?: string | null) {
  if (reason === "OTHER" && !remarks?.trim()) {
    throw new Error("REMARKS_REQUIRED_FOR_OTHER");
  }
}

/**
 * Resolve the payee account, creating a new reusable customer account when
 * needed. Existing accounts are never overwritten — a different account number
 * or IFSC always yields an additional row.
 */
async function resolveRefundBankAccount(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    account: RefundBankAccountInput;
    actorUserId: string;
  },
): Promise<{ id: string; isNew: boolean; accountNumberMasked: string; bankName: string }> {
  if (input.account.mode === "EXISTING") {
    const existing = await tx.customerRefundBankAccount.findUnique({
      where: { id: input.account.refundBankAccountId },
    });
    if (!existing || !existing.isActive) {
      throw new Error("REFUND_BANK_ACCOUNT_NOT_FOUND");
    }
    if (existing.customerId !== input.customerId) {
      throw new Error("REFUND_BANK_ACCOUNT_CUSTOMER_MISMATCH");
    }
    return {
      id: existing.id,
      isNew: false,
      accountNumberMasked: existing.accountNumberMasked,
      bankName: existing.bankName,
    };
  }

  const accountNumber = normalizeAccountNumber(input.account.accountNumber);
  const ifscCode = normalizeIfsc(input.account.ifscCode);

  if (!isValidRefundAccountNumber(accountNumber)) {
    throw new Error("INVALID_ACCOUNT_NUMBER");
  }
  if (!isValidIfsc(ifscCode)) {
    throw new Error("INVALID_IFSC");
  }

  // Same customer + account + IFSC is the same account: reuse, don't duplicate.
  const duplicate = await tx.customerRefundBankAccount.findUnique({
    where: {
      customerId_accountNumber_ifscCode: {
        customerId: input.customerId,
        accountNumber,
        ifscCode,
      },
    },
  });
  if (duplicate) {
    if (!duplicate.isActive) {
      await tx.customerRefundBankAccount.update({
        where: { id: duplicate.id },
        data: { isActive: true },
      });
    }
    return {
      id: duplicate.id,
      isNew: false,
      accountNumberMasked: duplicate.accountNumberMasked,
      bankName: duplicate.bankName,
    };
  }

  const created = await tx.customerRefundBankAccount.create({
    data: {
      customerId: input.customerId,
      accountHolderName: input.account.accountHolderName.trim(),
      accountNumber,
      accountNumberMasked: maskBankAccountNumber(accountNumber),
      ifscCode,
      bankName: input.account.bankName.trim(),
      createdById: input.actorUserId,
    },
  });

  return {
    id: created.id,
    isNew: true,
    accountNumberMasked: created.accountNumberMasked,
    bankName: created.bankName,
  };
}

export async function createCustomerRefund(
  prisma: PrismaClient,
  input: CreateCustomerRefundInput,
): Promise<SerializedCustomerRefund> {
  assertReasonRemarks(input.reason, input.remarks);

  if (!(input.requestedAmount > 0)) {
    throw new Error("REFUND_AMOUNT_INVALID");
  }

  const verified = await verifyRefundPayment(prisma, {
    companyId: input.companyId,
    verificationCode: input.verificationCode,
  });

  // Customer must come from verified payment data whenever it is available.
  let customerId: string;
  if (verified.customerId) {
    if (input.customerId && input.customerId !== verified.customerId) {
      throw new Error("CUSTOMER_MISMATCH");
    }
    customerId = verified.customerId;
  } else {
    if (!input.customerId) {
      throw new Error("CUSTOMER_REQUIRED");
    }
    customerId = input.customerId;
  }

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: input.companyId },
    select: { id: true, code: true },
  });

  const refund = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true, customerName: true },
    });
    if (!customer) {
      throw new Error("CUSTOMER_NOT_FOUND");
    }

    // Serialize concurrent requests against the original receipt and any extras.
    const referenceIds = await assertValidTransactionReferences(
      tx,
      input.companyId,
      input.bankTransactionIds,
      verified.bankTransactionId,
    );
    const receiptIds = uniqueIds([verified.bankTransactionId, ...referenceIds]);
    await lockBankTransactions(tx, receiptIds);

    const amounts = await loadRefundableAmountForReceipts(tx, receiptIds);
    if (input.requestedAmount > amounts.availableRefundAmount) {
      throw new Error("REFUND_AMOUNT_EXCEEDS_AVAILABLE");
    }

    const account = await resolveRefundBankAccount(tx, {
      customerId,
      account: input.refundBankAccount,
      actorUserId: input.actorUserId,
    });

    const refundNumber = await generateRefundNumber(tx, company.code, company.id);
    const status: CustomerRefundStatus = input.submit ? "PENDING_APPROVAL" : "DRAFT";
    const now = new Date();

    const created = await tx.customerRefund.create({
      data: {
        refundNumber,
        companyId: input.companyId,
        customerId,
        verificationCode: verified.verificationCode,
        bankTransactionId: verified.bankTransactionId,
        piNumber: input.piNumber?.trim() || verified.piNumbers[0] || null,
        receivedAmount: new Prisma.Decimal(verified.receivedAmount),
        requestedAmount: new Prisma.Decimal(input.requestedAmount),
        reason: input.reason,
        remarks: input.remarks?.trim() || null,
        status,
        refundBankAccountId: account.id,
        requestedById: input.actorUserId,
        requestedAt: now,
        submittedAt: input.submit ? now : null,
        transactionReferences: {
          create: referenceIds.map((bankTransactionId) => ({ bankTransactionId })),
        },
      },
      include: refundInclude,
    });

    if (account.isNew) {
      await writeRefundAuditTx(tx, {
        eventType: REFUND_AUDIT_EVENTS.REFUND_BANK_ACCOUNT_ADDED,
        recordId: created.id,
        action: "CREATE",
        performedBy: input.actorUserId,
        performedByRoles: input.actorRoles,
        companyId: input.companyId,
        reference: created.refundNumber,
        newValue: {
          refundBankAccountId: account.id,
          bankName: account.bankName,
          accountNumberMasked: account.accountNumberMasked,
        },
      });
    }

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_CREATED,
      recordId: created.id,
      action: "CREATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: input.companyId,
      reference: created.refundNumber,
      remarks: input.remarks ?? null,
      newValue: {
        customerId,
        customerName: customer.customerName,
        verificationCode: verified.verificationCode,
        receivedAmount: verified.receivedAmount,
        requestedAmount: input.requestedAmount,
        linkedTransactions: referenceIds.length,
        combinedReceivedAmount: amounts.receivedAmount,
        availableAtRequest: amounts.availableRefundAmount,
        reason: input.reason,
        piNumber: created.piNumber,
        refundBankAccountId: account.id,
        status,
      },
    });

    if (input.submit) {
      await writeRefundAuditTx(tx, {
        eventType: REFUND_AUDIT_EVENTS.REFUND_SUBMITTED,
        recordId: created.id,
        action: "UPDATE",
        performedBy: input.actorUserId,
        performedByRoles: input.actorRoles,
        companyId: input.companyId,
        reference: created.refundNumber,
        newValue: { status },
      });

      await notifyRefundApprovalNeeded(tx, {
        companyId: input.companyId,
        refundNumber: created.refundNumber,
        customerName: customer.customerName,
        amount: input.requestedAmount,
      });
    }

    return created;
  });

  return serializeCustomerRefund(refund);
}

export type UpdateCustomerRefundDraftInput = {
  id: string;
  piNumber?: string | null;
  requestedAmount?: number;
  reason?: CustomerRefundReason;
  remarks?: string | null;
  bankTransactionIds?: string[];
  refundBankAccount?: RefundBankAccountInput;
  actorUserId: string;
  actorRoles: string[];
};

export async function updateCustomerRefundDraft(
  prisma: PrismaClient,
  input: UpdateCustomerRefundDraftInput,
): Promise<SerializedCustomerRefund> {
  const refund = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerRefund.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "DRAFT") throw new Error("REFUND_NOT_EDITABLE");

    const reason = input.reason ?? existing.reason;
    const remarks =
      input.remarks !== undefined ? input.remarks?.trim() || null : existing.remarks;
    assertReasonRemarks(reason, remarks);

    let requestedAmount = decimalToNumber(existing.requestedAmount);
    if (input.requestedAmount !== undefined) {
      if (!(input.requestedAmount > 0)) throw new Error("REFUND_AMOUNT_INVALID");

      const referenceIds = input.bankTransactionIds
        ? await assertValidTransactionReferences(
            tx,
            existing.companyId,
            input.bankTransactionIds,
            existing.bankTransactionId,
          )
        : (
            await tx.customerRefundTransactionReference.findMany({
              where: { refundId: existing.id },
              select: { bankTransactionId: true },
            })
          ).map((row) => row.bankTransactionId);

      const receiptIds = uniqueIds([existing.bankTransactionId, ...referenceIds]);
      await lockBankTransactions(tx, receiptIds);
      const amounts = await loadRefundableAmountForReceipts(
        tx,
        receiptIds,
        existing.id,
      );
      if (input.requestedAmount > amounts.availableRefundAmount) {
        throw new Error("REFUND_AMOUNT_EXCEEDS_AVAILABLE");
      }
      requestedAmount = input.requestedAmount;
    }

    let refundBankAccountId = existing.refundBankAccountId;
    let newAccount: Awaited<ReturnType<typeof resolveRefundBankAccount>> | null = null;
    if (input.refundBankAccount) {
      newAccount = await resolveRefundBankAccount(tx, {
        customerId: existing.customerId,
        account: input.refundBankAccount,
        actorUserId: input.actorUserId,
      });
      refundBankAccountId = newAccount.id;
    }

    if (input.bankTransactionIds) {
      const referenceIds = await assertValidTransactionReferences(
        tx,
        existing.companyId,
        input.bankTransactionIds,
        existing.bankTransactionId,
      );
      await tx.customerRefundTransactionReference.deleteMany({
        where: { refundId: existing.id },
      });
      if (referenceIds.length > 0) {
        await tx.customerRefundTransactionReference.createMany({
          data: referenceIds.map((bankTransactionId) => ({
            refundId: existing.id,
            bankTransactionId,
          })),
        });
      }

      if (input.requestedAmount === undefined) {
        const receiptIds = uniqueIds([existing.bankTransactionId, ...referenceIds]);
        await lockBankTransactions(tx, receiptIds);
        const amounts = await loadRefundableAmountForReceipts(
          tx,
          receiptIds,
          existing.id,
        );
        if (requestedAmount > amounts.availableRefundAmount) {
          throw new Error("REFUND_AMOUNT_EXCEEDS_AVAILABLE");
        }
      }
    }

    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: {
        ...(input.piNumber !== undefined ? { piNumber: input.piNumber?.trim() || null } : {}),
        requestedAmount: new Prisma.Decimal(requestedAmount),
        reason,
        remarks,
        refundBankAccountId,
      },
      include: refundInclude,
    });

    if (newAccount?.isNew) {
      await writeRefundAuditTx(tx, {
        eventType: REFUND_AUDIT_EVENTS.REFUND_BANK_ACCOUNT_ADDED,
        recordId: updated.id,
        action: "CREATE",
        performedBy: input.actorUserId,
        performedByRoles: input.actorRoles,
        companyId: updated.companyId,
        reference: updated.refundNumber,
        newValue: {
          refundBankAccountId: newAccount.id,
          bankName: newAccount.bankName,
          accountNumberMasked: newAccount.accountNumberMasked,
        },
      });
    }

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_UPDATED,
      recordId: updated.id,
      action: "UPDATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      remarks: remarks ?? null,
      oldValue: {
        requestedAmount: decimalToNumber(existing.requestedAmount),
        reason: existing.reason,
        piNumber: existing.piNumber,
        refundBankAccountId: existing.refundBankAccountId,
      },
      newValue: {
        requestedAmount,
        reason,
        piNumber: updated.piNumber,
        refundBankAccountId,
      },
    });

    return updated;
  });

  return serializeCustomerRefund(refund);
}

export async function submitCustomerRefund(
  prisma: PrismaClient,
  input: { id: string; actorUserId: string; actorRoles: string[] },
): Promise<SerializedCustomerRefund> {
  const refund = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerRefund.findUnique({
      where: { id: input.id },
      include: { customer: { select: { customerName: true } } },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "DRAFT") throw new Error("REFUND_NOT_SUBMITTABLE");
    if (!existing.refundBankAccountId) throw new Error("REFUND_BANK_ACCOUNT_REQUIRED");

    // Re-check headroom across the original receipt and any extra linked orders.
    const receiptIds = await loadRefundReceiptIds(tx, existing);
    await lockBankTransactions(tx, receiptIds);
    const amounts = await loadRefundableAmountForReceipts(
      tx,
      receiptIds,
      existing.id,
    );
    if (decimalToNumber(existing.requestedAmount) > amounts.availableRefundAmount) {
      throw new Error("REFUND_AMOUNT_EXCEEDS_AVAILABLE");
    }

    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: { status: "PENDING_APPROVAL", submittedAt: new Date() },
      include: refundInclude,
    });

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_SUBMITTED,
      recordId: updated.id,
      action: "UPDATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      oldValue: { status: existing.status },
      newValue: { status: updated.status },
    });

    await notifyRefundApprovalNeeded(tx, {
      companyId: updated.companyId,
      refundNumber: updated.refundNumber,
      customerName: existing.customer.customerName,
      amount: decimalToNumber(updated.requestedAmount),
    });

    return updated;
  });

  return serializeCustomerRefund(refund);
}

export async function approveCustomerRefund(
  prisma: PrismaClient,
  input: {
    id: string;
    remarks?: string | null;
    actorUserId: string;
    actorRoles: string[];
  },
): Promise<SerializedCustomerRefund> {
  const refund = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerRefund.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "PENDING_APPROVAL") throw new Error("REFUND_NOT_PENDING_APPROVAL");

    const receiptIds = await loadRefundReceiptIds(tx, existing);
    await lockBankTransactions(tx, receiptIds);
    const amounts = await loadRefundableAmountForReceipts(
      tx,
      receiptIds,
      existing.id,
    );
    const requestedAmount = decimalToNumber(existing.requestedAmount);
    if (requestedAmount > amounts.availableRefundAmount) {
      throw new Error("REFUND_AMOUNT_EXCEEDS_AVAILABLE");
    }

    // Approving freezes amount, customer, firm, payee account and references.
    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: {
        status: "APPROVED",
        approvedAmount: new Prisma.Decimal(requestedAmount),
        approvedById: input.actorUserId,
        approvedAt: new Date(),
        approvalRemarks: input.remarks?.trim() || null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
      },
      include: refundInclude,
    });

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_APPROVED,
      recordId: updated.id,
      action: "APPROVE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      remarks: input.remarks ?? null,
      oldValue: { status: existing.status },
      newValue: {
        status: updated.status,
        approvedAmount: requestedAmount,
        lockedFields: [
          "requestedAmount",
          "customerId",
          "companyId",
          "refundBankAccountId",
          "bankTransactionId",
          "transactionReferences",
        ],
      },
    });

    await notifyRefundDecided(tx, {
      userId: updated.requestedById,
      refundNumber: updated.refundNumber,
      approved: true,
    });
    await notifyRefundExecutionNeeded(tx, {
      companyId: updated.companyId,
      refundNumber: updated.refundNumber,
      amount: requestedAmount,
    });

    return updated;
  });

  return serializeCustomerRefund(refund);
}

export async function rejectCustomerRefund(
  prisma: PrismaClient,
  input: {
    id: string;
    rejectionReason: string;
    actorUserId: string;
    actorRoles: string[];
  },
): Promise<SerializedCustomerRefund> {
  const reason = input.rejectionReason.trim();
  if (!reason) throw new Error("REJECTION_REASON_REQUIRED");

  const refund = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerRefund.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "PENDING_APPROVAL") throw new Error("REFUND_NOT_PENDING_APPROVAL");

    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: {
        status: "REJECTED",
        rejectedById: input.actorUserId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
      include: refundInclude,
    });

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_REJECTED,
      recordId: updated.id,
      action: "UPDATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      remarks: reason,
      oldValue: { status: existing.status },
      newValue: { status: updated.status, rejectionReason: reason },
    });

    await notifyRefundDecided(tx, {
      userId: updated.requestedById,
      refundNumber: updated.refundNumber,
      approved: false,
      reason,
    });

    return updated;
  });

  return serializeCustomerRefund(refund);
}

/**
 * Controlled correction path for an already-approved refund. Sends the request
 * back to DRAFT, clears the approval so the locked fields become editable, and
 * requires a fresh Sales Manager approval afterwards.
 */
export async function returnCustomerRefundForCorrection(
  prisma: PrismaClient,
  input: { id: string; reason: string; actorUserId: string; actorRoles: string[] },
): Promise<SerializedCustomerRefund> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("RETURN_REASON_REQUIRED");

  const refund = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerRefund.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("NOT_FOUND");
    if (!["PENDING_APPROVAL", "APPROVED", "FAILED"].includes(existing.status)) {
      throw new Error("REFUND_NOT_RETURNABLE");
    }
    // Money already moved: correcting is no longer a request-level operation.
    if (existing.utrNumber) throw new Error("REFUND_ALREADY_EXECUTED");

    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: {
        status: "DRAFT",
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
        approvedAmount: null,
        approvalRemarks: null,
        returnedForCorrectionAt: new Date(),
        returnedForCorrectionById: input.actorUserId,
        returnedForCorrectionReason: reason,
      },
      include: refundInclude,
    });

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_RETURNED_FOR_CORRECTION,
      recordId: updated.id,
      action: "UPDATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      remarks: reason,
      oldValue: {
        status: existing.status,
        approvedAmount:
          existing.approvedAmount === null ? null : decimalToNumber(existing.approvedAmount),
        approvedById: existing.approvedById,
      },
      newValue: { status: updated.status, requiresReapproval: true },
    });

    await notifyRefundDecided(tx, {
      userId: updated.requestedById,
      refundNumber: updated.refundNumber,
      approved: false,
      reason,
      returnedForCorrection: true,
    });

    return updated;
  });

  return serializeCustomerRefund(refund);
}

export type ProcessCustomerRefundInput = {
  id: string;
  refundDate: Date;
  actualRefundAmount: number;
  refundPaymentMode: PaymentMode;
  refundFromBankAccountId: string;
  utrNumber: string;
  remarks?: string | null;
  actorUserId: string;
  actorRoles: string[];
};

/**
 * Record the executed transfer and mark the refund as Refunded. Payment and PI
 * rows stay unchanged. When the payout consumes the remaining amount on the
 * original receipt plus any extra linked orders, those bank receipts are marked
 * RETURNED.
 */
export async function processCustomerRefund(
  prisma: PrismaClient,
  input: ProcessCustomerRefundInput,
): Promise<SerializedCustomerRefund> {
  const utrNumber = normalizeUtr(input.utrNumber);
  if (!utrNumber) throw new Error("UTR_REQUIRED");
  if (!(input.actualRefundAmount > 0)) throw new Error("REFUND_AMOUNT_INVALID");

  const refund = await prisma.$transaction(async (tx) => {
    // Lock the refund row so two operators cannot both execute it.
    await tx.$executeRaw`
      SELECT id FROM customer_refunds WHERE id = ${input.id}::uuid FOR UPDATE
    `;

    const existing = await tx.customerRefund.findUnique({
      where: { id: input.id },
      include: { customer: { select: { customerName: true } } },
    });
    if (!existing) throw new Error("NOT_FOUND");

    if (existing.status === "REFUNDED" || existing.utrNumber) {
      throw new Error("REFUND_ALREADY_EXECUTED");
    }
    if (!["APPROVED", "PROCESSING", "FAILED"].includes(existing.status)) {
      throw new Error("REFUND_NOT_APPROVED");
    }
    if (!existing.approvedAmount) throw new Error("REFUND_NOT_APPROVED");
    if (!existing.refundBankAccountId) throw new Error("REFUND_BANK_ACCOUNT_REQUIRED");

    const approvedAmount = decimalToNumber(existing.approvedAmount);
    if (input.actualRefundAmount > approvedAmount) {
      throw new Error("REFUND_AMOUNT_EXCEEDS_APPROVED");
    }

    // Firm bank accounts are strictly separated: a payout account must belong
    // to the refund's own firm.
    const fromAccount = await tx.bankAccount.findUnique({
      where: { id: input.refundFromBankAccountId },
      select: { id: true, companyId: true, isActive: true, bankName: true, accountNumberMasked: true },
    });
    if (!fromAccount || !fromAccount.isActive) {
      throw new Error("REFUND_FROM_BANK_ACCOUNT_NOT_FOUND");
    }
    if (fromAccount.companyId !== existing.companyId) {
      throw new Error("REFUND_FROM_BANK_ACCOUNT_COMPANY_MISMATCH");
    }

    const duplicateUtr = await tx.customerRefund.findFirst({
      where: { utrNumber, id: { not: existing.id } },
      select: { id: true, refundNumber: true },
    });
    if (duplicateUtr) throw new Error("UTR_ALREADY_USED");

    const receiptIds = await loadRefundReceiptIds(tx, existing);
    await lockBankTransactions(tx, receiptIds);
    const remaining = await loadRefundableAmountForReceipts(
      tx,
      receiptIds,
      existing.id,
    );
    const markReturned =
      remaining.availableRefundAmount > 0 &&
      (receiptIds.length > 1 ||
        shouldMarkAttachedReceiptsReturned(
          input.actualRefundAmount,
          remaining.availableRefundAmount,
        ));

    const now = new Date();
    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: {
        status: "REFUNDED",
        actualRefundAmount: new Prisma.Decimal(input.actualRefundAmount),
        refundDate: input.refundDate,
        refundPaymentMode: input.refundPaymentMode,
        refundFromBankAccountId: fromAccount.id,
        utrNumber,
        processingRemarks: input.remarks?.trim() || null,
        processedById: input.actorUserId,
        processedAt: now,
        failureReason: null,
      },
      include: refundInclude,
    });

    // Firm refund bank-account memory, so this account surfaces first next time.
    await tx.bankAccount.update({
      where: { id: fromAccount.id },
      data: { refundUsageCount: { increment: 1 }, lastRefundUsedAt: now },
    });

    // Customer refund bank-account memory (retained for future refunds).
    await tx.customerRefundBankAccount.update({
      where: { id: existing.refundBankAccountId },
      data: { usageCount: { increment: 1 }, lastUsedAt: now },
    });

    if (markReturned) {
      await markReceiptsReturned(tx, receiptIds);
    }

    const completed = markReturned
      ? await tx.customerRefund.findUniqueOrThrow({
          where: { id: updated.id },
          include: refundInclude,
        })
      : updated;

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_PROCESSING_STARTED,
      recordId: updated.id,
      action: "UPDATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      newValue: {
        refundFromBankAccountId: fromAccount.id,
        refundFromBank: `${fromAccount.bankName} ${fromAccount.accountNumberMasked}`,
        paymentMode: input.refundPaymentMode,
      },
    });

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_COMPLETED,
      recordId: updated.id,
      action: "UPDATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      remarks: input.remarks ?? null,
      oldValue: { status: existing.status },
      newValue: {
        status: updated.status,
        approvedAmount,
        actualRefundAmount: input.actualRefundAmount,
        utrNumber,
        refundDate: input.refundDate.toISOString().slice(0, 10),
        originalPaymentUnchanged: true,
        attachedReceiptsReturned: markReturned,
        returnedBankTransactionIds: markReturned ? receiptIds : [],
      },
    });

    await notifyRefundCompleted(tx, {
      userId: completed.requestedById,
      refundNumber: completed.refundNumber,
      amount: input.actualRefundAmount,
      utrNumber,
    });

    return completed;
  });

  return serializeCustomerRefund(refund);
}

export async function markCustomerRefundFailed(
  prisma: PrismaClient,
  input: { id: string; failureReason: string; actorUserId: string; actorRoles: string[] },
): Promise<SerializedCustomerRefund> {
  const failureReason = input.failureReason.trim();
  if (!failureReason) throw new Error("FAILURE_REASON_REQUIRED");

  const refund = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerRefund.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status === "REFUNDED" || existing.utrNumber) {
      throw new Error("REFUND_ALREADY_EXECUTED");
    }
    if (!["APPROVED", "PROCESSING"].includes(existing.status)) {
      throw new Error("REFUND_NOT_APPROVED");
    }

    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: { status: "FAILED", failureReason },
      include: refundInclude,
    });

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_FAILED,
      recordId: updated.id,
      action: "UPDATE",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      remarks: failureReason,
      oldValue: { status: existing.status },
      newValue: { status: updated.status, failureReason },
    });

    return updated;
  });

  return serializeCustomerRefund(refund);
}

export async function cancelCustomerRefund(
  prisma: PrismaClient,
  input: { id: string; reason?: string | null; actorUserId: string; actorRoles: string[] },
): Promise<SerializedCustomerRefund> {
  const refund = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerRefund.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status === "REFUNDED" || existing.utrNumber) {
      throw new Error("REFUND_ALREADY_EXECUTED");
    }
    if (!["DRAFT", "PENDING_APPROVAL"].includes(existing.status)) {
      throw new Error("REFUND_NOT_CANCELLABLE");
    }

    const updated = await tx.customerRefund.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        cancelledById: input.actorUserId,
        cancelledAt: new Date(),
      },
      include: refundInclude,
    });

    await writeRefundAuditTx(tx, {
      eventType: REFUND_AUDIT_EVENTS.REFUND_CANCELLED,
      recordId: updated.id,
      action: "CANCEL",
      performedBy: input.actorUserId,
      performedByRoles: input.actorRoles,
      companyId: updated.companyId,
      reference: updated.refundNumber,
      remarks: input.reason ?? null,
      oldValue: { status: existing.status },
      newValue: { status: updated.status },
    });

    return updated;
  });

  return serializeCustomerRefund(refund);
}

/** Amount panel for the detail/edit views. */
export async function getRefundAmountSummary(
  db: Db,
  refundId: string,
): Promise<RefundAmountSummary & { requestedAmount: number }> {
  const refund = await db.customerRefund.findUniqueOrThrow({
    where: { id: refundId },
    select: {
      id: true,
      bankTransactionId: true,
      requestedAmount: true,
    },
  });
  const receiptIds = await loadRefundReceiptIds(db, refund);
  const summary = await loadRefundableAmountForReceipts(db, receiptIds, refund.id);
  return { ...summary, requestedAmount: decimalToNumber(refund.requestedAmount) };
}
