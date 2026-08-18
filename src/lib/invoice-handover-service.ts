import {
  DocumentationStatus,
  InvoiceHandoverStatus,
  PricingType,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { roundMoney } from "@/lib/quotations";

const PENDING_STATUSES: InvoiceHandoverStatus[] = [
  InvoiceHandoverStatus.PENDING_INVOICE,
  InvoiceHandoverStatus.CORRECTION_REQUIRED,
];

const include = {
  dispatch: {
    select: {
      id: true,
      dcNo: true,
      dispatchDate: true,
      vehicleNo: true,
      notes: true,
      proformaInvoice: { select: { piNo: true } },
    },
  },
  customer: { select: { id: true, customerName: true } },
  recordedBy: { select: { id: true, name: true } },
  documentation: { select: { id: true, status: true } },
} as const;

const detailInclude = {
  customer: { select: { id: true, customerName: true } },
  recordedBy: { select: { id: true, name: true } },
  dispatch: {
    select: {
      id: true,
      dcNo: true,
      dispatchDate: true,
      vehicleNo: true,
      driverName: true,
      receiverName: true,
      receiverMobile: true,
      notes: true,
      lines: {
        select: {
          id: true,
          qty: true,
          product: {
            select: {
              id: true,
              displayName: true,
              pricingType: true,
              capacity: true,
            },
          },
          proformaInvoiceItem: { select: { rate: true } },
          serials: {
            select: { serial: { select: { id: true, serialNumber: true } } },
          },
        },
      },
      proformaInvoice: {
        select: {
          id: true,
          piNo: true,
          totalValue: true,
          creditStatus: true,
          creditDueDate: true,
          salesUser: { select: { id: true, name: true } },
          payments: {
            select: {
              id: true,
              amount: true,
              paymentDate: true,
              paymentMode: true,
              receivedInAccount: true,
              referenceNo: true,
              notes: true,
              recordedBy: { select: { id: true, name: true } },
            },
            orderBy: { paymentDate: "desc" as const },
          },
        },
      },
    },
  },
} as const;

export async function listInvoiceQueue(
  prisma: PrismaClient,
  companyId: string,
  filters: { scope?: "pending" | "completed" } = {},
) {
  return prisma.invoiceHandover.findMany({
    where: {
      companyId,
      ...(filters.scope === "completed"
        ? { status: InvoiceHandoverStatus.INVOICE_RECORDED }
        : filters.scope === "pending"
          ? { status: { in: PENDING_STATUSES } }
          : {}),
    },
    include,
    orderBy:
      filters.scope === "completed"
        ? [{ recordedAt: "desc" }, { createdAt: "desc" }]
        : [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function getInvoiceHandoverDetail(
  prisma: PrismaClient,
  companyId: string,
  handoverId: string,
) {
  const handover = await prisma.invoiceHandover.findFirst({
    where: { id: handoverId, companyId },
    include: detailInclude,
  });
  if (!handover) return null;

  const lines = handover.dispatch.lines.map((line) => {
    const qty = decimalToNumber(line.qty);
    const rate = decimalToNumber(line.proformaInvoiceItem.rate);
    const capacity = decimalToNumber(line.product.capacity);
    const amount =
      line.product.pricingType === PricingType.WP
        ? roundMoney(qty * capacity * rate)
        : roundMoney(qty * rate);
    return {
      id: line.id,
      qty,
      rate,
      amount,
      product: {
        id: line.product.id,
        displayName: line.product.displayName,
        pricingType: line.product.pricingType,
        capacity,
      },
      serials: line.serials.map((entry) => ({
        id: entry.serial.id,
        serialNumber: entry.serial.serialNumber,
      })),
    };
  });

  const dispatchTotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const payments = handover.dispatch.proformaInvoice.payments.map((payment) => ({
    id: payment.id,
    amount: decimalToNumber(payment.amount),
    paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    paymentMode: payment.paymentMode,
    receivedInAccount: payment.receivedInAccount,
    referenceNo: payment.referenceNo,
    notes: payment.notes,
    recordedBy: payment.recordedBy,
  }));
  const totalPaid = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const totalValue = decimalToNumber(handover.dispatch.proformaInvoice.totalValue);
  const outstanding = roundMoney(Math.max(0, totalValue - totalPaid));

  return {
    id: handover.id,
    status: handover.status,
    invoiceNumber: handover.invoiceNumber,
    invoiceDate: handover.invoiceDate?.toISOString().slice(0, 10) ?? null,
    remarks: handover.remarks,
    customer: handover.customer,
    recordedBy: handover.recordedBy,
    dispatch: {
      id: handover.dispatch.id,
      dcNo: handover.dispatch.dcNo,
      dispatchDate: handover.dispatch.dispatchDate.toISOString().slice(0, 10),
      vehicleNo: handover.dispatch.vehicleNo,
      driverName: handover.dispatch.driverName,
      receiverName: handover.dispatch.receiverName,
      receiverMobile: handover.dispatch.receiverMobile,
      notes: handover.dispatch.notes,
      totalAmount: dispatchTotal,
      lines,
    },
    proformaInvoice: {
      id: handover.dispatch.proformaInvoice.id,
      piNo: handover.dispatch.proformaInvoice.piNo,
      totalValue,
      salesUser: handover.dispatch.proformaInvoice.salesUser,
      payments,
      totalPaid,
      outstanding,
      creditStatus: handover.dispatch.proformaInvoice.creditStatus,
      creditDueDate: handover.dispatch.proformaInvoice.creditDueDate
        ? handover.dispatch.proformaInvoice.creditDueDate.toISOString().slice(0, 10)
        : null,
    },
  };
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

    const existingDocumentation = await tx.documentationRecord.findUnique({
      where: { dispatchId: handover.dispatchId },
    });

    if (existingDocumentation) {
      await tx.documentationStatusHistory.create({
        data: {
          documentationRecordId: existingDocumentation.id,
          fromStatus: existingDocumentation.status,
          toStatus: existingDocumentation.status,
          remarks: "Invoice recorded",
          changedById: input.recordedById,
        },
      });
    } else {
      await tx.documentationRecord.create({
        data: {
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
      });
    }

    return updated;
  });
}
