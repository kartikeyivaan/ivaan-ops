import { ManualPaymentRequestStatus, ProformaInvoiceStatus, type PrismaClient } from "@prisma/client";
import { recordPayment } from "@/lib/pi-service";

type Db = PrismaClient;

export type ManualPaymentInput = {
  companyId: string;
  piId: string;
  amount: number;
  paymentDate: Date;
  paymentMode: string;
  receivedInAccount: string;
  referenceNo: string;
  notes?: string;
  requestedById: string;
};

/** Manual entry is blocked unless Accounts has explicitly switched it off. */
export async function isManualEntryBlocked(db: Db, companyId: string): Promise<boolean> {
  const row = await db.paymentEntryPolicy.findUnique({
    where: { companyId },
    select: { manualEntryBlocked: true },
  });
  return row?.manualEntryBlocked ?? true;
}

export async function setManualEntryBlocked(
  db: Db,
  input: { companyId: string; blocked: boolean; updatedById: string },
) {
  return db.paymentEntryPolicy.upsert({
    where: { companyId: input.companyId },
    create: {
      companyId: input.companyId,
      manualEntryBlocked: input.blocked,
      updatedById: input.updatedById,
    },
    update: { manualEntryBlocked: input.blocked, updatedById: input.updatedById },
  });
}

export async function createManualPaymentRequest(db: Db, input: ManualPaymentInput) {
  if (input.amount <= 0) throw new Error("INVALID_AMOUNT");

  const pi = await db.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    select: { status: true },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (
    pi.status === ProformaInvoiceStatus.DRAFT ||
    pi.status === ProformaInvoiceStatus.CANCEL_PENDING ||
    pi.status === ProformaInvoiceStatus.CANCELLED
  ) {
    throw new Error("INVALID_STATUS");
  }

  return db.manualPaymentRequest.create({
    data: {
      companyId: input.companyId,
      proformaInvoiceId: input.piId,
      amount: input.amount,
      paymentDate: input.paymentDate,
      paymentMode: input.paymentMode as never,
      receivedInAccount: input.receivedInAccount as never,
      referenceNo: input.referenceNo,
      notes: input.notes?.trim() || null,
      requestedById: input.requestedById,
    },
  });
}

export async function listPendingManualPaymentRequests(
  db: Db,
  companyId: string,
  piId: string,
) {
  return db.manualPaymentRequest.findMany({
    where: { companyId, proformaInvoiceId: piId, status: ManualPaymentRequestStatus.PENDING },
    include: { requestedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Accounts approval: writes the payment through the normal PI payment path
 * (so outstanding and status rules still apply), then marks the request approved.
 */
export async function approveManualPaymentRequest(
  db: Db,
  input: { companyId: string; requestId: string; decidedById: string },
) {
  const request = await db.manualPaymentRequest.findFirst({
    where: { id: input.requestId, companyId: input.companyId },
  });
  if (!request) throw new Error("NOT_FOUND");
  if (request.status !== ManualPaymentRequestStatus.PENDING) throw new Error("NOT_PENDING");
  if (!request.receivedInAccount) throw new Error("MISSING_RECEIVED_IN_ACCOUNT");

  await recordPayment(db, {
    companyId: input.companyId,
    piId: request.proformaInvoiceId,
    amount: Number(request.amount),
    paymentDate: request.paymentDate,
    paymentMode: request.paymentMode,
    receivedInAccount: request.receivedInAccount,
    referenceNo: request.referenceNo,
    notes: request.notes ?? undefined,
    recordedById: request.requestedById,
  });

  const payment = await db.payment.findFirst({
    where: {
      proformaInvoiceId: request.proformaInvoiceId,
      referenceNo: request.referenceNo,
      recordedById: request.requestedById,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return db.manualPaymentRequest.update({
    where: { id: request.id },
    data: {
      status: ManualPaymentRequestStatus.APPROVED,
      decidedById: input.decidedById,
      decidedAt: new Date(),
      paymentId: payment?.id ?? null,
    },
  });
}

export async function rejectManualPaymentRequest(
  db: Db,
  input: { companyId: string; requestId: string; decidedById: string; remarks?: string },
) {
  const request = await db.manualPaymentRequest.findFirst({
    where: { id: input.requestId, companyId: input.companyId },
    select: { id: true, status: true },
  });
  if (!request) throw new Error("NOT_FOUND");
  if (request.status !== ManualPaymentRequestStatus.PENDING) throw new Error("NOT_PENDING");

  return db.manualPaymentRequest.update({
    where: { id: request.id },
    data: {
      status: ManualPaymentRequestStatus.REJECTED,
      decidedById: input.decidedById,
      decidedAt: new Date(),
      decisionRemarks: input.remarks?.trim() || null,
    },
  });
}
