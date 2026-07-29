import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  DispatchStatus,
  InventoryEventStatus,
  InventoryEventType,
  InventoryTransactionType,
  Prisma,
  ProformaInvoiceStatus,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import {
  generateDispatchNumber,
  getRemainingQty,
  toDateOnly,
} from "@/lib/dispatches";
import { decimalToNumber, normalizeSerialNumber } from "@/lib/inventory";
import { toSignedInventoryQuantity } from "@/lib/inventory-events";
import {
  notifyDispatchCompleted,
  notifyInvoicePending,
} from "@/lib/notification-service";
import { deductNonSerialStock } from "@/lib/transfer-service";
import { roundMoney } from "@/lib/quotations";

const dispatchInclude = {
  company: {
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
      tagline: true,
      bankDetails: true,
      termsAndConditions: true,
    },
  },
  customer: {
    select: {
      id: true,
      customerName: true,
      customerCode: true,
      gstNumber: true,
      address: true,
      city: true,
      state: true,
      mobile: true,
    },
  },
  proformaInvoice: { select: { id: true, piNo: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  dispatchedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
          hsn: true,
        },
      },
      proformaInvoiceItem: {
        select: {
          id: true,
          qty: true,
          dispatchedQty: true,
          rate: true,
        },
      },
      serials: {
        include: {
          serial: {
            select: { id: true, serialNumber: true },
          },
        },
      },
    },
  },
} satisfies Prisma.DispatchInclude;

export type DispatchRecord = Prisma.DispatchGetPayload<{
  include: typeof dispatchInclude;
}>;

type DispatchLineInput = {
  proformaInvoiceItemId: string;
  productId: string;
  qty: number;
  serialIds?: string[];
};

function serializeDispatch(dispatch: DispatchRecord) {
  return {
    id: dispatch.id,
    dcNo: dispatch.dcNo,
    status: dispatch.status,
    dispatchDate: dispatch.dispatchDate.toISOString().slice(0, 10),
    vehicleNo: dispatch.vehicleNo,
    driverName: dispatch.driverName,
    receiverName: dispatch.receiverName,
    receiverMobile: dispatch.receiverMobile,
    signatureUrl: dispatch.signatureUrl,
    notes: dispatch.notes,
    dispatchedAt: dispatch.dispatchedAt?.toISOString() ?? null,
    customer: dispatch.customer,
    proformaInvoice: dispatch.proformaInvoice,
    warehouse: dispatch.warehouse,
    createdBy: dispatch.createdBy,
    dispatchedBy: dispatch.dispatchedBy,
    lines: dispatch.lines.map((line) => ({
      id: line.id,
      qty: decimalToNumber(line.qty),
      product: line.product,
      proformaInvoiceItem: {
        id: line.proformaInvoiceItem.id,
        orderedQty: decimalToNumber(line.proformaInvoiceItem.qty),
        dispatchedQty: decimalToNumber(line.proformaInvoiceItem.dispatchedQty),
        rate: decimalToNumber(line.proformaInvoiceItem.rate),
      },
      serials: line.serials.map((entry) => ({
        id: entry.serial.id,
        serialNumber: entry.serial.serialNumber,
      })),
    })),
    totalValue: roundMoney(
      dispatch.lines.reduce((sum, line) => {
        const rate = decimalToNumber(line.proformaInvoiceItem.rate);
        return sum + decimalToNumber(line.qty) * rate;
      }, 0),
    ),
  };
}

async function refreshPiDispatchStatus(
  tx: Prisma.TransactionClient,
  piId: string,
) {
  const pi = await tx.proformaInvoice.findUniqueOrThrow({
    where: { id: piId },
    include: { items: true },
  });

  const allDispatched = pi.items.every(
    (item) => decimalToNumber(item.dispatchedQty) >= decimalToNumber(item.qty),
  );
  const anyDispatched = pi.items.some((item) => decimalToNumber(item.dispatchedQty) > 0);

  let status = pi.status;
  if (allDispatched) {
    status = ProformaInvoiceStatus.FULLY_DISPATCHED;
  } else if (anyDispatched) {
    status = ProformaInvoiceStatus.PARTIALLY_DISPATCHED;
  } else if (
    pi.status === ProformaInvoiceStatus.PARTIALLY_DISPATCHED ||
    pi.status === ProformaInvoiceStatus.FULLY_DISPATCHED
  ) {
    status = ProformaInvoiceStatus.BOOKED;
  }

  if (status !== pi.status) {
    await tx.proformaInvoice.update({
      where: { id: piId },
      data: { status },
    });
  }
}

export async function listDispatches(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    status?: DispatchStatus;
    customerId?: string;
    proformaInvoiceId?: string;
  },
) {
  const rows = await prisma.dispatch.findMany({
    where: {
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.proformaInvoiceId
        ? { proformaInvoiceId: filters.proformaInvoiceId }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { dcNo: { contains: filters.q, mode: "insensitive" } },
              { customer: { customerName: { contains: filters.q, mode: "insensitive" } } },
              { proformaInvoice: { piNo: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: dispatchInclude,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(serializeDispatch);
}

export async function getDispatchById(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: dispatchId, companyId },
    include: dispatchInclude,
  });
  if (!dispatch) return null;
  return serializeDispatch(dispatch);
}

export async function getDispatchRecord(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
): Promise<DispatchRecord | null> {
  return prisma.dispatch.findFirst({
    where: { id: dispatchId, companyId },
    include: dispatchInclude,
  });
}

export async function listDispatchableProformaInvoices(
  prisma: PrismaClient,
  companyId: string,
) {
  const rows = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      status: {
        in: [ProformaInvoiceStatus.BOOKED, ProformaInvoiceStatus.PARTIALLY_DISPATCHED],
      },
    },
    include: {
      customer: { select: { id: true, customerName: true, customerCode: true } },
      warehouse: { select: { id: true, name: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              displayName: true,
              serialTracking: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows
    .map((pi) => ({
      id: pi.id,
      piNo: pi.piNo,
      status: pi.status,
      customer: pi.customer,
      warehouse: pi.warehouse,
      items: pi.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.displayName,
        serialTracking: item.product.serialTracking,
        orderedQty: decimalToNumber(item.qty),
        dispatchedQty: decimalToNumber(item.dispatchedQty),
        remainingQty: getRemainingQty(
          decimalToNumber(item.qty),
          decimalToNumber(item.dispatchedQty),
        ),
      })),
    }))
    .filter((pi) => pi.items.some((item) => item.remainingQty > 0));
}

export async function listBookedSerialsForPi(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    productId: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");

  const serials = await prisma.proformaInvoiceSerial.findMany({
    where: {
      piId: input.piId,
      serial: {
        productId: input.productId,
        status: SerialStatus.BOOKED,
      },
    },
    include: {
      serial: {
        select: { id: true, serialNumber: true, status: true },
      },
    },
    orderBy: { serial: { serialNumber: "asc" } },
  });

  return serials.map((entry) => entry.serial);
}

export async function lookupBookedSerialForDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    serialNumber: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");

  const serial = await prisma.inventorySerial.findFirst({
    where: {
      serialNumber: normalizeSerialNumber(input.serialNumber),
      status: SerialStatus.BOOKED,
      lot: { companyId: input.companyId },
      proformaInvoiceSerials: { some: { piId: input.piId } },
    },
    include: {
      product: {
        select: { id: true, displayName: true, serialTracking: true },
      },
    },
  });

  if (!serial) throw new Error("SERIAL_NOT_FOUND");
  return {
    id: serial.id,
    serialNumber: serial.serialNumber,
    product: serial.product,
  };
}

async function validateDispatchLines(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    warehouseId: string;
    lines: DispatchLineInput[];
  },
) {
  if (input.lines.length === 0) throw new Error("LINES_REQUIRED");

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: { items: { include: { product: true } } },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (
    pi.status !== ProformaInvoiceStatus.BOOKED &&
    pi.status !== ProformaInvoiceStatus.PARTIALLY_DISPATCHED
  ) {
    throw new Error("INVALID_PI_STATUS");
  }
  if (pi.warehouseId !== input.warehouseId) throw new Error("WAREHOUSE_MISMATCH");

  for (const line of input.lines) {
    if (line.qty <= 0) throw new Error("INVALID_QUANTITY");

    const piItem = pi.items.find((item) => item.id === line.proformaInvoiceItemId);
    if (!piItem || piItem.productId !== line.productId) throw new Error("INVALID_LINE");

    const remaining = getRemainingQty(
      decimalToNumber(piItem.qty),
      decimalToNumber(piItem.dispatchedQty),
    );
    if (line.qty > remaining) throw new Error("EXCEEDS_REMAINING_QTY");

    if (piItem.product.serialTracking) {
      const serialIds = line.serialIds ?? [];
      if (serialIds.length !== Math.ceil(line.qty)) throw new Error("SERIAL_REQUIRED");

      const booked = await prisma.proformaInvoiceSerial.findMany({
        where: {
          piId: input.piId,
          serialId: { in: serialIds },
          serial: {
            productId: line.productId,
            status: SerialStatus.BOOKED,
            currentWarehouseId: input.warehouseId,
          },
        },
      });
      if (booked.length !== serialIds.length) throw new Error("INVALID_SERIAL_SELECTION");
    }
  }

  return pi;
}

export async function createDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proformaInvoiceId: string;
    createdById: string;
    vehicleNo?: string;
    driverName?: string;
    receiverName?: string;
    receiverMobile?: string;
    signatureUrl?: string;
    notes?: string;
    confirm: boolean;
    lines: DispatchLineInput[];
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.proformaInvoiceId, companyId: input.companyId },
    include: { company: true },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (!pi.warehouseId) throw new Error("WAREHOUSE_REQUIRED");

  await validateDispatchLines(prisma, {
    companyId: input.companyId,
    piId: pi.id,
    warehouseId: pi.warehouseId,
    lines: input.lines,
  });

  const dispatchDate = toDateOnly(new Date());
  const dcNo = await generateDispatchNumber(
    prisma,
    pi.company.code,
    input.companyId,
    dispatchDate,
  );

  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.create({
      data: {
        dcNo,
        companyId: input.companyId,
        customerId: pi.customerId,
        proformaInvoiceId: pi.id,
        warehouseId: pi.warehouseId!,
        status: DispatchStatus.DRAFT,
        dispatchDate,
        vehicleNo: input.vehicleNo,
        driverName: input.driverName,
        receiverName: input.receiverName,
        receiverMobile: input.receiverMobile,
        signatureUrl: input.signatureUrl,
        notes: input.notes,
        createdById: input.createdById,
        lines: {
          create: input.lines.map((line) => ({
            proformaInvoiceItemId: line.proformaInvoiceItemId,
            productId: line.productId,
            qty: line.qty,
            serials: line.serialIds?.length
              ? {
                  create: line.serialIds.map((serialId) => ({ serialId })),
                }
              : undefined,
          })),
        },
      },
      include: dispatchInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "dispatches",
      recordId: dispatch.id,
      action: "CREATE",
      newValue: { dcNo: dispatch.dcNo, status: dispatch.status },
      performedBy: input.createdById,
      companyId: input.companyId,
      reference: dispatch.dcNo,
    });

    if (input.confirm) {
      return confirmDispatchTx(tx, {
        companyId: input.companyId,
        dispatchId: dispatch.id,
        performedById: input.createdById,
      });
    }

    return serializeDispatch(dispatch);
  });
}

async function confirmDispatchTx(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    dispatchId: string;
    performedById: string;
  },
) {
  const dispatch = await tx.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: {
      proformaInvoice: { select: { salesUserId: true } },
      lines: {
        include: {
          product: true,
          proformaInvoiceItem: true,
          serials: true,
        },
      },
    },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== DispatchStatus.DRAFT) throw new Error("INVALID_STATUS");
  if (
    !dispatch.vehicleNo?.trim() ||
    !dispatch.receiverName?.trim() ||
    !dispatch.receiverMobile?.trim()
  ) {
    throw new Error("MANDATORY_DISPATCH_FIELDS_REQUIRED");
  }

  for (const line of dispatch.lines) {
    const qty = decimalToNumber(line.qty);
    const piItem = line.proformaInvoiceItem;
    const remaining = getRemainingQty(
      decimalToNumber(piItem.qty),
      decimalToNumber(piItem.dispatchedQty),
    );
    if (qty > remaining) throw new Error("EXCEEDS_REMAINING_QTY");

    if (line.product.serialTracking) {
      const serialIds = line.serials.map((entry) => entry.serialId);
      const booked = await tx.proformaInvoiceSerial.findMany({
        where: {
          piId: dispatch.proformaInvoiceId,
          serialId: { in: serialIds },
          serial: { status: SerialStatus.BOOKED },
        },
      });
      if (booked.length !== serialIds.length) throw new Error("INVALID_SERIAL_SELECTION");

      await tx.inventorySerial.updateMany({
        where: { id: { in: serialIds } },
        data: { status: SerialStatus.DISPATCHED },
      });
    } else {
      await deductNonSerialStock(tx, {
        companyId: input.companyId,
        warehouseId: dispatch.warehouseId,
        productId: line.productId,
        qty,
      });
    }

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.DISPATCH,
        companyId: input.companyId,
        productId: line.productId,
        qty,
        fromWarehouseId: dispatch.warehouseId,
        referenceType: "DISPATCH",
        referenceId: dispatch.id,
        notes: `Dispatched on ${dispatch.dcNo}`,
        createdById: input.performedById,
      },
    });

    const existingActualEvent = await tx.inventoryEvent.findFirst({
      where: {
        sourceType: "DISPATCH",
        sourceId: dispatch.id,
        productId: line.productId,
        eventType: InventoryEventType.ACTUAL_DISPATCH,
        status: { not: InventoryEventStatus.CANCELLED },
      },
    });
    if (!existingActualEvent) {
      await tx.inventoryEvent.create({
        data: {
          companyId: input.companyId,
          warehouseId: dispatch.warehouseId,
          productId: line.productId,
          eventType: InventoryEventType.ACTUAL_DISPATCH,
          quantity: qty,
          quantityEffect: toSignedInventoryQuantity(InventoryEventType.ACTUAL_DISPATCH, qty),
          effectiveDate: dispatch.dispatchDate,
          sourceType: "DISPATCH",
          sourceId: dispatch.id,
          sourceNumber: dispatch.dcNo,
          status: InventoryEventStatus.COMPLETED,
          createdById: input.performedById,
        },
      });
    }

    await tx.inventoryEvent.updateMany({
      where: {
        sourceType: "DISPATCH",
        sourceId: dispatch.id,
        productId: line.productId,
        eventType: InventoryEventType.PLANNED_DISPATCH,
        status: InventoryEventStatus.ACTIVE,
      },
      data: {
        status: InventoryEventStatus.COMPLETED,
        updatedById: input.performedById,
      },
    });

    await tx.proformaInvoiceItem.update({
      where: { id: piItem.id },
      data: {
        dispatchedQty: decimalToNumber(piItem.dispatchedQty) + qty,
      },
    });
  }

  const updated = await tx.dispatch.update({
    where: { id: dispatch.id },
    data: {
      status: DispatchStatus.DISPATCHED,
      dispatchedById: input.performedById,
      dispatchedAt: new Date(),
    },
    include: dispatchInclude,
  });

  await refreshPiDispatchStatus(tx, dispatch.proformaInvoiceId);

  await tx.invoiceHandover.upsert({
    where: { dispatchId: dispatch.id },
    create: {
      dispatchId: dispatch.id,
      companyId: dispatch.companyId,
      customerId: dispatch.customerId,
      status: "PENDING_INVOICE",
    },
    update: {},
  });

  await writeAuditLogTx(tx, {
    tableName: "dispatches",
    recordId: dispatch.id,
    action: "UPDATE",
    oldValue: { status: DispatchStatus.DRAFT },
    newValue: { status: DispatchStatus.DISPATCHED },
    performedBy: input.performedById,
    companyId: input.companyId,
    reference: dispatch.dcNo,
  });

  await Promise.all([
    notifyDispatchCompleted(tx, {
      salesUserId: dispatch.proformaInvoice.salesUserId,
      dcNo: dispatch.dcNo,
    }),
    notifyInvoicePending(tx, {
      companyId: input.companyId,
      dcNo: dispatch.dcNo,
    }),
  ]);

  return serializeDispatch(updated);
}

export async function confirmDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    performedById: string;
  },
) {
  return prisma.$transaction((tx) => confirmDispatchTx(tx, input));
}

export async function requestDispatchCancel(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    requestedById: string;
    remarks?: string;
  },
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== DispatchStatus.DISPATCHED) throw new Error("INVALID_STATUS");

  const existing = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.DC_CANCEL,
      moduleId: dispatch.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (existing) throw new Error("CANCEL_ALREADY_REQUESTED");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.dispatch.update({
      where: { id: dispatch.id },
      data: { status: DispatchStatus.CANCEL_PENDING },
      include: dispatchInclude,
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.DC_CANCEL,
        moduleId: dispatch.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: input.remarks,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "dispatches",
      recordId: dispatch.id,
      action: "UPDATE",
      newValue: { status: DispatchStatus.CANCEL_PENDING },
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: dispatch.dcNo,
    });

    return serializeDispatch(updated);
  });
}

export async function approveDispatchCancel(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: {
      lines: {
        include: {
          product: true,
          proformaInvoiceItem: true,
          serials: true,
        },
      },
    },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== DispatchStatus.CANCEL_PENDING) throw new Error("INVALID_STATUS");

  return prisma.$transaction(async (tx) => {
    for (const line of dispatch.lines) {
      const qty = decimalToNumber(line.qty);

      if (line.product.serialTracking) {
        const serialIds = line.serials.map((entry) => entry.serialId);
        await tx.inventorySerial.updateMany({
          where: { id: { in: serialIds } },
          data: { status: SerialStatus.BOOKED },
        });
      }

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.ADJUST,
          companyId: input.companyId,
          productId: line.productId,
          qty,
          toWarehouseId: dispatch.warehouseId,
          referenceType: "DISPATCH_CANCEL",
          referenceId: dispatch.id,
          notes: `Cancelled dispatch ${dispatch.dcNo}`,
          createdById: input.approvedById,
        },
      });

      const piItem = line.proformaInvoiceItem;
      await tx.proformaInvoiceItem.update({
        where: { id: piItem.id },
        data: {
          dispatchedQty: Math.max(0, decimalToNumber(piItem.dispatchedQty) - qty),
        },
      });
    }

    const updated = await tx.dispatch.update({
      where: { id: dispatch.id },
      data: { status: DispatchStatus.CANCELLED },
      include: dispatchInclude,
    });

    await refreshPiDispatchStatus(tx, dispatch.proformaInvoiceId);

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.DC_CANCEL,
        moduleId: dispatch.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "dispatches",
      recordId: dispatch.id,
      action: "CANCEL",
      newValue: { status: DispatchStatus.CANCELLED },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: dispatch.dcNo,
    });

    return serializeDispatch(updated);
  });
}

export async function countTodaysDispatches(prisma: PrismaClient, companyId: string) {
  const today = toDateOnly(new Date());
  return prisma.dispatch.count({
    where: {
      companyId,
      status: DispatchStatus.DISPATCHED,
      dispatchDate: today,
    },
  });
}

export async function countPendingDispatchCancels(prisma: PrismaClient, companyId: string) {
  return prisma.dispatch.count({
    where: { companyId, status: DispatchStatus.CANCEL_PENDING },
  });
}

export async function getCustomerDispatchMetrics(
  prisma: PrismaClient,
  companyId: string,
  customerId: string,
) {
  const dispatches = await prisma.dispatch.findMany({
    where: {
      companyId,
      customerId,
      status: DispatchStatus.DISPATCHED,
    },
    include: {
      lines: {
        include: {
          proformaInvoiceItem: { select: { rate: true } },
        },
      },
    },
  });

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  let totalDispatchValueThisYear = 0;

  for (const dispatch of dispatches) {
    if (dispatch.dispatchedAt && dispatch.dispatchedAt >= yearStart) {
      for (const line of dispatch.lines) {
        totalDispatchValueThisYear +=
          decimalToNumber(line.qty) * decimalToNumber(line.proformaInvoiceItem.rate);
      }
    }
  }

  return {
    totalDispatchValueThisYear: roundMoney(totalDispatchValueThisYear),
    dispatchCount: dispatches.length,
  };
}
