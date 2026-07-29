import { DocumentationStatus, type PrismaClient } from "@prisma/client";
import {
  notifyDocumentationAssigned,
  notifyDocumentationStatusChanged,
} from "@/lib/notification-service";

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
  dispatch: { select: { id: true, dcNo: true, dispatchDate: true, receiverName: true, receiverMobile: true } },
  invoiceHandover: { select: { invoiceNumber: true, invoiceDate: true } },
  customer: { select: { id: true, customerName: true, mobile: true } },
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

export async function listDocumentation(
  prisma: PrismaClient,
  companyId: string,
  filters: { status?: DocumentationStatus; assignedToId?: string; q?: string } = {},
) {
  const rows = await prisma.documentationRecord.findMany({
    where: {
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      ...(filters.q ? { OR: [
        { dispatch: { dcNo: { contains: filters.q, mode: "insensitive" } } },
        { customer: { customerName: { contains: filters.q, mode: "insensitive" } } },
        { invoiceHandover: { invoiceNumber: { contains: filters.q, mode: "insensitive" } } },
      ] } : {}),
    },
    include,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(withAgeing);
}

export async function getDocumentation(prisma: PrismaClient, companyId: string, id: string) {
  const row = await prisma.documentationRecord.findFirst({ where: { id, companyId }, include });
  return row ? withAgeing(row) : null;
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
      include: { dispatch: { select: { dcNo: true } } },
    });
    if (!current) throw new Error("NOT_FOUND");
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
      include: { dispatch: { select: { dcNo: true } } },
    });
    if (!current) throw new Error("NOT_FOUND");
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
