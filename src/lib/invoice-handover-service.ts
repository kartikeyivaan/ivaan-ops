import { DocumentationStatus, InvoiceHandoverStatus, type PrismaClient } from "@prisma/client";

export async function listInvoiceQueue(prisma: PrismaClient, companyId: string) {
  return prisma.invoiceHandover.findMany({
    where: { companyId },
    include: {
      dispatch: {
        select: {
          id: true,
          dcNo: true,
          dispatchDate: true,
          vehicleNo: true,
          proformaInvoice: { select: { piNo: true } },
        },
      },
      customer: { select: { id: true, customerName: true } },
      recordedBy: { select: { id: true, name: true } },
      documentation: { select: { id: true, status: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function recordInvoice(
  prisma: PrismaClient,
  input: {
    companyId: string;
    handoverId: string;
    invoiceNumber: string;
    invoiceDate: Date;
    remarks?: string;
    attachmentUrl?: string;
    recordedById: string;
  },
) {
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber) throw new Error("INVOICE_NUMBER_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const handover = await tx.invoiceHandover.findFirst({
      where: { id: input.handoverId, companyId: input.companyId },
    });
    if (!handover) throw new Error("NOT_FOUND");

    const updated = await tx.invoiceHandover.update({
      where: { id: handover.id },
      data: {
        status: InvoiceHandoverStatus.INVOICE_RECORDED,
        invoiceNumber,
        invoiceDate: input.invoiceDate,
        remarks: input.remarks,
        attachmentUrl: input.attachmentUrl,
        recordedById: input.recordedById,
        recordedAt: new Date(),
      },
    });

    await tx.documentationRecord.upsert({
      where: { dispatchId: handover.dispatchId },
      create: {
        dispatchId: handover.dispatchId,
        invoiceHandoverId: handover.id,
        companyId: handover.companyId,
        customerId: handover.customerId,
        status: DocumentationStatus.PENDING,
        statusHistory: {
          create: {
            toStatus: DocumentationStatus.PENDING,
            changedById: input.recordedById,
            remarks: "Created after invoice recording",
          },
        },
      },
      update: {},
    });

    return updated;
  });
}
