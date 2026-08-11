import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  PiCreditStatus,
  Prisma,
  ProformaInvoiceStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLog, writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber } from "@/lib/inventory";
import {
  notifyPiCreditAccountsApprovalNeeded,
  notifyPiCreditApproved,
  notifyPiCreditCleared,
  notifyPiCreditOverdueEscalation,
  notifyPiCreditReminder,
  notifyPiCreditSmApprovalNeeded,
} from "@/lib/notification-service";
import {
  canRequestPiCreditOnStatus,
  computeCreditDueDate,
  hasApprovedPiCredit,
  isCreditOverdue,
  shouldSendCreditReminder,
} from "@/lib/pi-credit";
import {
  calculateOutstanding,
  isOutstandingWithinTolerance,
  toDateOnly,
} from "@/lib/proforma-invoices";

type CreditClient = PrismaClient | Prisma.TransactionClient;

function creditInclude() {
  return {
    customer: {
      select: {
        id: true,
        customerName: true,
        firmName: true,
      },
    },
    salesUser: { select: { id: true, name: true } },
    creditRequestedBy: { select: { id: true, name: true } },
    creditSmApprovedBy: { select: { id: true, name: true } },
    creditAccountsApprovedBy: { select: { id: true, name: true } },
    payments: { select: { amount: true } },
  } satisfies Prisma.ProformaInvoiceInclude;
}

export type PiCreditSnapshot = {
  status: PiCreditStatus;
  notes: string | null;
  requestedAt: string | null;
  requestedBy: { id: string; name: string } | null;
  smApprovedAt: string | null;
  smApprovedBy: { id: string; name: string } | null;
  accountsApprovedAt: string | null;
  accountsApprovedBy: { id: string; name: string } | null;
  dueDate: string | null;
  clearedAt: string | null;
  rejectionReason: string | null;
  overdue: boolean;
  canRequest: boolean;
};

export function serializePiCredit(
  pi: {
    creditStatus: PiCreditStatus;
    creditNotes: string | null;
    creditRequestedAt: Date | null;
    creditSmApprovedAt: Date | null;
    creditAccountsApprovedAt: Date | null;
    creditDueDate: Date | null;
    creditClearedAt: Date | null;
    creditRejectionReason: string | null;
    status: ProformaInvoiceStatus;
    creditRequestedBy?: { id: string; name: string } | null;
    creditSmApprovedBy?: { id: string; name: string } | null;
    creditAccountsApprovedBy?: { id: string; name: string } | null;
  },
  outstanding: number,
): PiCreditSnapshot {
  return {
    status: pi.creditStatus,
    notes: pi.creditNotes,
    requestedAt: pi.creditRequestedAt?.toISOString() ?? null,
    requestedBy: pi.creditRequestedBy ?? null,
    smApprovedAt: pi.creditSmApprovedAt?.toISOString() ?? null,
    smApprovedBy: pi.creditSmApprovedBy ?? null,
    accountsApprovedAt: pi.creditAccountsApprovedAt?.toISOString() ?? null,
    accountsApprovedBy: pi.creditAccountsApprovedBy ?? null,
    dueDate: pi.creditDueDate ? pi.creditDueDate.toISOString().slice(0, 10) : null,
    clearedAt: pi.creditClearedAt?.toISOString() ?? null,
    rejectionReason: pi.creditRejectionReason,
    overdue: isCreditOverdue({
      creditStatus: pi.creditStatus,
      outstanding,
      dueDate: pi.creditDueDate,
    }),
    canRequest: canRequestPiCreditOnStatus(pi.status, pi.creditStatus, outstanding),
  };
}

async function loadPiForCredit(
  prisma: CreditClient,
  companyId: string,
  piId: string,
) {
  return prisma.proformaInvoice.findFirst({
    where: { id: piId, companyId },
    include: creditInclude(),
  });
}

function outstandingFromPayments(
  totalValue: Prisma.Decimal,
  payments: { amount: Prisma.Decimal }[],
): number {
  const totalPaid = payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
  return calculateOutstanding(decimalToNumber(totalValue), totalPaid);
}

/**
 * True when the customer has any open approved credit past its due date
 * with unpaid outstanding (blocks new bookings / dispatches for the firm).
 */
export async function customerHasOverdueCredit(
  prisma: CreditClient,
  input: { companyId: string; customerId: string; excludePiId?: string },
): Promise<boolean> {
  const today = toDateOnly(new Date());
  const candidates = await prisma.proformaInvoice.findMany({
    where: {
      companyId: input.companyId,
      customerId: input.customerId,
      creditStatus: PiCreditStatus.APPROVED,
      creditDueDate: { lt: today },
      ...(input.excludePiId ? { id: { not: input.excludePiId } } : {}),
      status: {
        notIn: [ProformaInvoiceStatus.CANCELLED, ProformaInvoiceStatus.CANCEL_PENDING],
      },
    },
    include: { payments: { select: { amount: true } } },
  });

  return candidates.some((pi) => {
    const outstanding = outstandingFromPayments(pi.totalValue, pi.payments);
    return !isOutstandingWithinTolerance(outstanding);
  });
}

export async function assertCustomerCreditClear(
  prisma: CreditClient,
  input: { companyId: string; customerId: string; excludePiId?: string },
) {
  if (await customerHasOverdueCredit(prisma, input)) {
    throw new Error("CUSTOMER_CREDIT_OVERDUE");
  }
}

export async function clearPiCreditIfPaid(
  prisma: CreditClient,
  input: { companyId: string; piId: string; performedById?: string },
): Promise<boolean> {
  const pi = await loadPiForCredit(prisma, input.companyId, input.piId);
  if (!pi) return false;
  if (pi.creditStatus !== PiCreditStatus.APPROVED) return false;

  const outstanding = outstandingFromPayments(pi.totalValue, pi.payments);
  if (!isOutstandingWithinTolerance(outstanding)) return false;

  await prisma.proformaInvoice.update({
    where: { id: pi.id },
    data: {
      creditStatus: PiCreditStatus.CLEARED,
      creditClearedAt: new Date(),
    },
  });

  if (input.performedById) {
    const auditInput = {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE" as const,
      oldValue: { creditStatus: PiCreditStatus.APPROVED },
      newValue: { creditStatus: PiCreditStatus.CLEARED },
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: pi.piNo,
    };
    if ("$transaction" in prisma) {
      await writeAuditLog(auditInput);
    } else {
      await writeAuditLogTx(prisma, auditInput);
    }
  }

  await notifyPiCreditCleared(prisma, {
    salesUserId: pi.salesUserId,
    piNo: pi.piNo,
  });

  return true;
}

export async function requestPiCredit(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    requestedById: string;
    notes?: string;
  },
) {
  const pi = await loadPiForCredit(prisma, input.companyId, input.piId);
  if (!pi) throw new Error("NOT_FOUND");

  const outstanding = outstandingFromPayments(pi.totalValue, pi.payments);
  if (!canRequestPiCreditOnStatus(pi.status, pi.creditStatus, outstanding)) {
    throw new Error("CREDIT_NOT_REQUESTABLE");
  }

  await assertCustomerCreditClear(prisma, {
    companyId: input.companyId,
    customerId: pi.customerId,
    excludePiId: pi.id,
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        creditStatus: PiCreditStatus.PENDING_SM,
        creditNotes: input.notes?.trim() || null,
        creditRequestedAt: new Date(),
        creditRequestedById: input.requestedById,
        creditSmApprovedAt: null,
        creditSmApprovedById: null,
        creditAccountsApprovedAt: null,
        creditAccountsApprovedById: null,
        creditDueDate: null,
        creditClearedAt: null,
        creditRejectionReason: null,
        creditLastReminderOn: null,
      },
      include: creditInclude(),
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.PI_CREDIT,
        moduleId: pi.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: input.notes?.trim() || `Credit dispatch requested (outstanding ₹${outstanding})`,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { creditStatus: pi.creditStatus },
      newValue: { creditStatus: PiCreditStatus.PENDING_SM },
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    await notifyPiCreditSmApprovalNeeded(tx, {
      companyId: input.companyId,
      piNo: pi.piNo,
      outstanding,
    });

    return serializePiCredit(updated, outstanding);
  });
}

export async function approvePiCreditSm(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const pi = await loadPiForCredit(prisma, input.companyId, input.piId);
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.creditStatus !== PiCreditStatus.PENDING_SM) {
    throw new Error("NO_PENDING_CREDIT_SM");
  }

  const outstanding = outstandingFromPayments(pi.totalValue, pi.payments);
  if (isOutstandingWithinTolerance(outstanding)) {
    throw new Error("NO_OUTSTANDING");
  }

  return prisma.$transaction(async (tx) => {
    const pending = await tx.approvalRequest.findFirst({
      where: {
        moduleType: ApprovalModuleType.PI_CREDIT,
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new Error("NO_PENDING_CREDIT_SM");

    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        approvedAt: new Date(),
        remarks: input.remarks?.trim() || pending.remarks,
      },
    });

    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        creditStatus: PiCreditStatus.PENDING_ACCOUNTS,
        creditSmApprovedAt: new Date(),
        creditSmApprovedById: input.approvedById,
      },
      include: creditInclude(),
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.PI_CREDIT_ACCOUNTS,
        moduleId: pi.id,
        requestedById: pi.creditRequestedById ?? input.approvedById,
        status: ApprovalRequestStatus.PENDING,
        remarks:
          input.remarks?.trim() ||
          `Accounts credit approval (outstanding ₹${outstanding})`,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { creditStatus: PiCreditStatus.PENDING_SM },
      newValue: { creditStatus: PiCreditStatus.PENDING_ACCOUNTS },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    await notifyPiCreditAccountsApprovalNeeded(tx, {
      companyId: input.companyId,
      piNo: pi.piNo,
      outstanding,
    });

    return serializePiCredit(updated, outstanding);
  });
}

export async function approvePiCreditAccounts(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const pi = await loadPiForCredit(prisma, input.companyId, input.piId);
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.creditStatus !== PiCreditStatus.PENDING_ACCOUNTS) {
    throw new Error("NO_PENDING_CREDIT_ACCOUNTS");
  }

  const outstanding = outstandingFromPayments(pi.totalValue, pi.payments);
  if (isOutstandingWithinTolerance(outstanding)) {
    throw new Error("NO_OUTSTANDING");
  }

  const now = new Date();
  const dueDate = computeCreditDueDate(now);

  return prisma.$transaction(async (tx) => {
    const pending = await tx.approvalRequest.findFirst({
      where: {
        moduleType: ApprovalModuleType.PI_CREDIT_ACCOUNTS,
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new Error("NO_PENDING_CREDIT_ACCOUNTS");

    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        approvedAt: now,
        remarks: input.remarks?.trim() || pending.remarks,
      },
    });

    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        creditStatus: PiCreditStatus.APPROVED,
        creditAccountsApprovedAt: now,
        creditAccountsApprovedById: input.approvedById,
        creditDueDate: dueDate,
      },
      include: creditInclude(),
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { creditStatus: PiCreditStatus.PENDING_ACCOUNTS },
      newValue: {
        creditStatus: PiCreditStatus.APPROVED,
        creditDueDate: dueDate.toISOString().slice(0, 10),
      },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    await notifyPiCreditApproved(tx, {
      salesUserId: pi.salesUserId,
      piNo: pi.piNo,
      dueDate: dueDate.toISOString().slice(0, 10),
      outstanding,
    });

    return serializePiCredit(updated, outstanding);
  });
}

export async function rejectPiCredit(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const pi = await loadPiForCredit(prisma, input.companyId, input.piId);
  if (!pi) throw new Error("NOT_FOUND");
  if (
    pi.creditStatus !== PiCreditStatus.PENDING_SM &&
    pi.creditStatus !== PiCreditStatus.PENDING_ACCOUNTS
  ) {
    throw new Error("NO_PENDING_CREDIT");
  }

  const moduleType =
    pi.creditStatus === PiCreditStatus.PENDING_SM
      ? ApprovalModuleType.PI_CREDIT
      : ApprovalModuleType.PI_CREDIT_ACCOUNTS;

  const outstanding = outstandingFromPayments(pi.totalValue, pi.payments);

  return prisma.$transaction(async (tx) => {
    const pending = await tx.approvalRequest.findFirst({
      where: {
        moduleType,
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new Error("NO_PENDING_CREDIT");

    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        approvedAt: new Date(),
        remarks: input.reason.trim(),
      },
    });

    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        creditStatus: PiCreditStatus.REJECTED,
        creditRejectionReason: input.reason.trim(),
        creditDueDate: null,
      },
      include: creditInclude(),
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { creditStatus: pi.creditStatus },
      newValue: {
        creditStatus: PiCreditStatus.REJECTED,
        reason: input.reason.trim(),
      },
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    return serializePiCredit(updated, outstanding);
  });
}

export async function processPiCreditReminders(
  prisma: PrismaClient,
  options?: { companyId?: string; today?: Date },
): Promise<{ reminded: number; escalated: number }> {
  const today = toDateOnly(options?.today ?? new Date());

  const pis = await prisma.proformaInvoice.findMany({
    where: {
      creditStatus: PiCreditStatus.APPROVED,
      ...(options?.companyId ? { companyId: options.companyId } : {}),
      status: {
        notIn: [ProformaInvoiceStatus.CANCELLED, ProformaInvoiceStatus.CANCEL_PENDING],
      },
    },
    include: {
      payments: { select: { amount: true } },
      salesUser: { select: { id: true } },
    },
  });

  let reminded = 0;
  let escalated = 0;

  for (const pi of pis) {
    const outstanding = outstandingFromPayments(pi.totalValue, pi.payments);
    if (isOutstandingWithinTolerance(outstanding)) {
      await clearPiCreditIfPaid(prisma, {
        companyId: pi.companyId,
        piId: pi.id,
      });
      continue;
    }

    if (
      !shouldSendCreditReminder({
        creditStatus: pi.creditStatus,
        outstanding,
        accountsApprovedAt: pi.creditAccountsApprovedAt,
        lastReminderOn: pi.creditLastReminderOn,
        today,
      })
    ) {
      continue;
    }

    const dueDate = pi.creditDueDate
      ? pi.creditDueDate.toISOString().slice(0, 10)
      : null;
    const overdue = isCreditOverdue({
      creditStatus: pi.creditStatus,
      outstanding,
      dueDate: pi.creditDueDate,
      today,
    });

    await notifyPiCreditReminder(prisma, {
      salesUserId: pi.salesUserId,
      piNo: pi.piNo,
      outstanding,
      dueDate,
      overdue,
    });

    if (overdue) {
      await notifyPiCreditOverdueEscalation(prisma, {
        companyId: pi.companyId,
        piNo: pi.piNo,
        outstanding,
        dueDate,
        salesExecutiveName: undefined,
      });
      escalated += 1;
    }

    await prisma.proformaInvoice.update({
      where: { id: pi.id },
      data: { creditLastReminderOn: today },
    });
    reminded += 1;
  }

  return { reminded, escalated };
}

export function piHasDispatchCredit(creditStatus: string | null | undefined): boolean {
  return hasApprovedPiCredit(creditStatus);
}
