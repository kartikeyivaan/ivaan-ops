import {
  DocumentationStatus,
  InvoiceHandoverStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  assertDispatchEligibleForDownstreamProcessing,
  dispatchEligibleForDownstreamWhere,
} from "@/lib/dispatch-workflow-eligibility";
import {
  notifyDocumentationAssigned,
  notifyDocumentationStatusChanged,
} from "@/lib/notification-service";

const PENDING_INVOICE_STATUSES: InvoiceHandoverStatus[] = [
  InvoiceHandoverStatus.PENDING_INVOICE,
  InvoiceHandoverStatus.CORRECTION_REQUIRED,
];

function pendingInvoiceDocumentationWhere(companyId: string) {
  return {
    companyId,
    status: { in: PENDING_INVOICE_STATUSES },
    documentation: { is: null },
    dispatch: dispatchEligibleForDownstreamWhere,
  };
}

export function calculateDocumentationAgeing(createdAt: Date, asOf = new Date()) {
  return Math.max(0, Math.floor((asOf.getTime() - createdAt.getTime()) / 86_400_000));
}

export function validateDocumentationStatusInput(
  status: DocumentationStatus,
  input: { holdReason?: string | null; reviewReason?: string | null },
) {
  if (status === DocumentationStatus.HOLD && !input.holdReason?.trim()) {
    throw new Error("HOLD_REASON_REQUIRED");
  }
  if (status === DocumentationStatus.FOR_REVIEW && !input.reviewReason?.trim()) {
    throw new Error("REVIEW_REASON_REQUIRED");
  }
}

const include = {
  dispatch: {
    select: {
      id: true,
      dcNo: true,
      status: true,
      dispatchDate: true,
      receiverName: true,
      receiverMobile: true,
      proformaInvoice: { select: { piNo: true } },
      lines: {
        select: {
          id: true,
          qty: true,
          product: { select: { displayName: true } },
          serials: {
            select: { serial: { select: { serialNumber: true } } },
          },
        },
      },
    },
  },
  invoiceHandover: { select: { invoiceNumber: true, invoiceDate: true } },
  customer: { select: { id: true, customerName: true, gstNumber: true, mobile: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  completedBy: { select: { id: true, name: true } },
  statusHistory: {
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: "desc" as const },
  },
  assignmentHistory: {
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: "desc" as const },
  },
};

function withAgeing<T extends { createdAt: Date; completedDate: Date | null }>(row: T) {
  return { ...row, ageingDays: calculateDocumentationAgeing(row.createdAt, row.completedDate ?? new Date()) };
}

const HISTORY_STATUSES: DocumentationStatus[] = [
  DocumentationStatus.DCR_ISSUED,
  DocumentationStatus.NOT_REQUIRED,
  DocumentationStatus.DCR_REVOKED,
];

export async function listDocumentation(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    status?: DocumentationStatus;
    statuses?: DocumentationStatus[];
    scope?: "active" | "history";
    assignedToId?: string;
    q?: string;
  } = {},
) {
  const statusFilter = filters.status
    ? { status: filters.status }
    : filters.statuses?.length
      ? { status: { in: filters.statuses } }
      : filters.scope === "history"
        ? { status: { in: HISTORY_STATUSES } }
        : filters.scope === "active"
          ? { status: { notIn: HISTORY_STATUSES } }
          : {};

  const rows = await prisma.documentationRecord.findMany({
    where: {
      companyId,
      ...statusFilter,
      ...(filters.scope === "active" ? { dispatch: dispatchEligibleForDownstreamWhere } : {}),
      ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      ...(filters.q ? { OR: [
        { dispatch: { dcNo: { contains: filters.q, mode: "insensitive" } } },
        { customer: { customerName: { contains: filters.q, mode: "insensitive" } } },
        { invoiceHandover: { invoiceNumber: { contains: filters.q, mode: "insensitive" } } },
      ] } : {}),
    },
    include,
    orderBy: filters.scope === "history" ? { completedDate: "desc" } : { createdAt: "asc" },
  });
  return rows.map(withAgeing);
}

export async function getDocumentation(prisma: PrismaClient, companyId: string, id: string) {
  const row = await prisma.documentationRecord.findFirst({ where: { id, companyId }, include });
  return row ? withAgeing(row) : null;
}

export async function countPendingInvoiceDocumentation(prisma: PrismaClient, companyId: string) {
  return prisma.invoiceHandover.count({
    where: pendingInvoiceDocumentationWhere(companyId),
  });
}

export async function listPendingInvoiceDocumentation(prisma: PrismaClient, companyId: string) {
  const rows = await prisma.invoiceHandover.findMany({
    where: pendingInvoiceDocumentationWhere(companyId),
    select: {
      id: true,
      createdAt: true,
      dispatch: {
        select: {
          dcNo: true,
          dispatchDate: true,
          proformaInvoice: { select: { piNo: true } },
        },
      },
      customer: { select: { customerName: true, gstNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    ...row,
    ageingDays: calculateDocumentationAgeing(row.dispatch.dispatchDate),
  }));
}

export async function markDispatchForDcr(
  prisma: PrismaClient,
  input: { companyId: string; handoverId: string; changedById: string },
) {
  return prisma.$transaction(async (tx) => {
    const handover = await tx.invoiceHandover.findFirst({
      where: { id: input.handoverId, companyId: input.companyId },
      include: {
        documentation: { select: { id: true } },
        dispatch: { select: { status: true } },
      },
    });
    if (!handover) throw new Error("NOT_FOUND");
    if (handover.documentation) throw new Error("ALREADY_EXISTS");
    try {
      assertDispatchEligibleForDownstreamProcessing(handover.dispatch.status);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "DISPATCH_CANCELLED") {
        throw new Error("DISPATCH_CANCELLED");
      }
      throw new Error("DISPATCH_NOT_DISPATCHED");
    }
    if (!PENDING_INVOICE_STATUSES.includes(handover.status)) {
      throw new Error("NOT_PENDING_INVOICE");
    }

    const created = await tx.documentationRecord.create({
      data: {
        dispatchId: handover.dispatchId,
        invoiceHandoverId: handover.id,
        companyId: handover.companyId,
        customerId: handover.customerId,
        status: DocumentationStatus.PENDING,
        statusHistory: {
          create: {
            toStatus: DocumentationStatus.PENDING,
            changedById: input.changedById,
            remarks: "Marked to send DCR before invoice recording",
          },
        },
      },
      include,
    });
    return withAgeing(created);
  });
}

export async function updateDocumentationStatus(
  prisma: PrismaClient,
  input: {
    companyId: string;
    id: string;
    status: DocumentationStatus;
    changedById: string;
    holdReason?: string;
    reviewReason?: string;
    remarks?: string;
    internalNotes?: string;
  },
) {
  validateDocumentationStatusInput(input.status, input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.documentationRecord.findFirst({
      where: { id: input.id, companyId: input.companyId },
      include: { dispatch: { select: { dcNo: true, status: true } } },
    });
    if (!current) throw new Error("NOT_FOUND");
    assertDispatchEligibleForDownstreamProcessing(current.dispatch.status);
    const complete = input.status === DocumentationStatus.DCR_ISSUED || input.status === DocumentationStatus.NOT_REQUIRED;
    const updated = await tx.documentationRecord.update({
      where: { id: input.id },
      data: {
        status: input.status,
        holdReason: input.status === DocumentationStatus.HOLD ? input.holdReason?.trim() : null,
        reviewReason: input.status === DocumentationStatus.FOR_REVIEW ? input.reviewReason?.trim() : null,
        remarks: input.remarks,
        internalNotes: input.internalNotes,
        completedDate: complete ? new Date() : null,
        completedById: complete ? input.changedById : null,
      },
      include,
    });
    await tx.documentationStatusHistory.create({
      data: {
        documentationRecordId: input.id,
        fromStatus: current.status,
        toStatus: input.status,
        holdReason: input.holdReason,
        reviewReason: input.reviewReason,
        remarks: input.remarks,
        changedById: input.changedById,
      },
    });
    if (current.assignedToId && current.assignedToId !== input.changedById) {
      await notifyDocumentationStatusChanged(tx, {
        userId: current.assignedToId,
        dcNo: current.dispatch.dcNo,
        status: input.status,
      });
    }
    return withAgeing(updated);
  });
}

export async function assignDocumentation(
  prisma: PrismaClient,
  input: { companyId: string; id: string; toUserId: string | null; changedById: string; reason?: string },
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.documentationRecord.findFirst({
      where: { id: input.id, companyId: input.companyId },
      include: { dispatch: { select: { dcNo: true, status: true } } },
    });
    if (!current) throw new Error("NOT_FOUND");
    assertDispatchEligibleForDownstreamProcessing(current.dispatch.status);
    if (input.toUserId) {
      const user = await tx.user.findFirst({
        where: { id: input.toUserId, status: "ACTIVE", companies: { some: { companyId: input.companyId } } },
      });
      if (!user) throw new Error("ASSIGNEE_NOT_FOUND");
    }
    const updated = await tx.documentationRecord.update({
      where: { id: input.id },
      data: { assignedToId: input.toUserId, assignedDate: input.toUserId ? new Date() : null },
      include,
    });
    await tx.documentationAssignmentHistory.create({
      data: {
        documentationRecordId: input.id,
        fromUserId: current.assignedToId,
        toUserId: input.toUserId,
        changedById: input.changedById,
        reason: input.reason,
      },
    });
    if (input.toUserId && input.toUserId !== input.changedById) {
      await notifyDocumentationAssigned(tx, {
        userId: input.toUserId,
        dcNo: current.dispatch.dcNo,
      });
    }
    return withAgeing(updated);
  });
}

/** Close in-progress documentation when a DC is cancelled (terminal state). */
export async function voidDocumentationForCancelledDispatch(
  tx: Prisma.TransactionClient,
  input: { dispatchId: string; performedById: string; dcNo: string },
) {
  const doc = await tx.documentationRecord.findUnique({
    where: { dispatchId: input.dispatchId },
  });
  if (!doc || HISTORY_STATUSES.includes(doc.status)) return;
  if (doc.status === DocumentationStatus.DCR_ISSUED) return;

  await tx.documentationRecord.update({
    where: { id: doc.id },
    data: {
      status: DocumentationStatus.NOT_REQUIRED,
      completedDate: new Date(),
      completedById: input.performedById,
      internalNotes: doc.internalNotes
        ? `${doc.internalNotes}\nVoided: DC ${input.dcNo} cancelled.`
        : `Voided: DC ${input.dcNo} cancelled.`,
    },
  });

  await tx.documentationStatusHistory.create({
    data: {
      documentationRecordId: doc.id,
      fromStatus: doc.status,
      toStatus: DocumentationStatus.NOT_REQUIRED,
      remarks: `Delivery challan ${input.dcNo} cancelled — documentation stopped`,
      changedById: input.performedById,
    },
  });
}
