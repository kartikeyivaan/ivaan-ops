import {
  DispatchStatus,
  DocumentationStatus,
  InvoiceHandoverStatus,
  TaskLinkedRecordType,
  TaskPriority,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { createSystemTaskIdempotent } from "@/lib/task-system-service";

import { SYSTEM_TASK_TRIGGERS } from "@/lib/task-system-service";

export const DISPATCH_CANCEL_REVOKE_TRIGGERS = {
  INVOICE: SYSTEM_TASK_TRIGGERS.DC_CANCEL_INVOICE_REVOKE,
  DCR: SYSTEM_TASK_TRIGGERS.DC_CANCEL_DCR_REVOKE,
} as const;

function revokeTaskDueDate(): string {
  const due = new Date();
  due.setDate(due.getDate() + 2);
  return due.toISOString().slice(0, 10);
}

async function resolveDcrExecutorId(
  tx: Prisma.TransactionClient,
  documentationId: string,
  completedById: string | null,
): Promise<string | null> {
  if (completedById) return completedById;
  const issued = await tx.documentationStatusHistory.findFirst({
    where: {
      documentationRecordId: documentationId,
      toStatus: DocumentationStatus.DCR_ISSUED,
    },
    orderBy: { changedAt: "desc" },
    select: { changedById: true },
  });
  return issued?.changedById ?? null;
}

/** After DC cancel is approved: assign revoke tasks to invoice recorder / DCR issuer. */
export async function createRevokeTasksForCancelledDispatch(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    dispatchId: string;
    dcNo: string;
    piNo: string;
    fallbackAssigneeId: string;
  },
) {
  const handover = await tx.invoiceHandover.findUnique({
    where: { dispatchId: input.dispatchId },
    include: {
      documentation: {
        select: { id: true, status: true, completedById: true },
      },
    },
  });
  if (!handover) return;

  const dueDate = revokeTaskDueDate();

  if (handover.status === InvoiceHandoverStatus.INVOICE_RECORDED) {
    const assigneeId = handover.recordedById ?? input.fallbackAssigneeId;
    await createSystemTaskIdempotent(
      tx,
      {
        triggerKey: DISPATCH_CANCEL_REVOKE_TRIGGERS.INVOICE,
        sourceType: TaskLinkedRecordType.INVOICE,
        sourceId: handover.id,
        assignedToId: assigneeId,
        companyId: input.companyId,
        title: `Revoke invoice — DC cancelled (${input.dcNo})`,
        description:
          `Delivery challan ${input.dcNo} (PI ${input.piNo}) was cancelled after invoice` +
          ` ${handover.invoiceNumber ?? "—"} was recorded. Cancel the invoice in Tally/ERP, then complete this task to mark it as invoice cancelled in IvaanOps.`,
        reason: `DC ${input.dcNo} cancelled with a recorded invoice.`,
        dueDate,
        priority: TaskPriority.HIGH,
      },
      null,
    );
  }

  const doc = handover.documentation;
  if (doc?.status === DocumentationStatus.DCR_ISSUED) {
    const assigneeId =
      (await resolveDcrExecutorId(tx, doc.id, doc.completedById)) ??
      input.fallbackAssigneeId;
    await createSystemTaskIdempotent(
      tx,
      {
        triggerKey: DISPATCH_CANCEL_REVOKE_TRIGGERS.DCR,
        sourceType: TaskLinkedRecordType.DOCUMENTATION,
        sourceId: doc.id,
        assignedToId: assigneeId,
        companyId: input.companyId,
        title: `Revoke DCR — DC cancelled (${input.dcNo})`,
        description:
          `Delivery challan ${input.dcNo} (PI ${input.piNo}) was cancelled after DCR was issued.` +
          " Confirm whether the DCR was sent externally; if so, revoke it, then complete this task.",
        reason: `DC ${input.dcNo} cancelled after DCR was issued.`,
        dueDate,
        priority: TaskPriority.HIGH,
      },
      null,
    );
  }
}

export async function markInvoiceCancelledAfterDcRevoke(
  client: PrismaClient | Prisma.TransactionClient,
  input: {
    companyId: string;
    handoverId: string;
    actorUserId: string;
    note?: string | null;
  },
) {
  const handover = await client.invoiceHandover.findFirst({
    where: { id: input.handoverId, companyId: input.companyId },
    include: { dispatch: { select: { status: true, dcNo: true } } },
  });
  if (!handover) throw new Error("NOT_FOUND");
  if (handover.dispatch.status !== DispatchStatus.CANCELLED) {
    throw new Error("DISPATCH_NOT_CANCELLED");
  }
  if (handover.status !== InvoiceHandoverStatus.INVOICE_RECORDED) {
    throw new Error("INVALID_HANDOVER_STATUS");
  }

  const note = input.note?.trim();
  const remarkSuffix = note ? ` ${note}` : "";

  return client.invoiceHandover.update({
    where: { id: handover.id },
    data: {
      status: InvoiceHandoverStatus.INVOICE_CANCELLED,
      remarks: handover.remarks
        ? `${handover.remarks}\nInvoice cancelled in ERP after DC ${handover.dispatch.dcNo} cancel.${remarkSuffix}`
        : `Invoice cancelled in ERP after DC ${handover.dispatch.dcNo} cancel.${remarkSuffix}`,
    },
  });
}

export async function markDcrRevokedAfterDcCancel(
  client: PrismaClient | Prisma.TransactionClient,
  input: {
    companyId: string;
    documentationId: string;
    actorUserId: string;
    note?: string | null;
  },
) {
  const run = async (tx: Prisma.TransactionClient) => {
    const doc = await tx.documentationRecord.findFirst({
      where: { id: input.documentationId, companyId: input.companyId },
      include: { dispatch: { select: { status: true, dcNo: true } } },
    });
    if (!doc) throw new Error("NOT_FOUND");
    if (doc.dispatch.status !== DispatchStatus.CANCELLED) {
      throw new Error("DISPATCH_NOT_CANCELLED");
    }
    if (doc.status !== DocumentationStatus.DCR_ISSUED) {
      throw new Error("INVALID_DOCUMENTATION_STATUS");
    }

    const note = input.note?.trim();
    const updated = await tx.documentationRecord.update({
      where: { id: doc.id },
      data: {
        status: DocumentationStatus.DCR_REVOKED,
        completedDate: new Date(),
        completedById: input.actorUserId,
        remarks: note ?? doc.remarks,
        internalNotes: doc.internalNotes
          ? `${doc.internalNotes}\nDCR revoke confirmed after DC ${doc.dispatch.dcNo} cancel.`
          : `DCR revoke confirmed after DC ${doc.dispatch.dcNo} cancel.`,
      },
    });

    await tx.documentationStatusHistory.create({
      data: {
        documentationRecordId: doc.id,
        fromStatus: DocumentationStatus.DCR_ISSUED,
        toStatus: DocumentationStatus.DCR_REVOKED,
        remarks:
          note ??
          `DCR revoked after delivery challan ${doc.dispatch.dcNo} was cancelled`,
        changedById: input.actorUserId,
      },
    });

    return updated;
  };

  if ("$transaction" in client) {
    return (client as PrismaClient).$transaction(run);
  }
  return run(client as Prisma.TransactionClient);
}
