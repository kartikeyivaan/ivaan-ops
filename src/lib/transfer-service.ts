import {
  InventoryTransactionType,
  LotStatus,
  Prisma,
  SerialStatus,
  TransferStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import {
  decimalToNumber,
  generateLotNumber,
  generateTransferNumber,
  systemPurchaseInvoiceNo,
} from "@/lib/inventory";

const transferInclude = {
  fromCompany: { select: { id: true, name: true, code: true } },
  toCompany: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  dispatchedBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
        },
      },
      serials: {
        include: {
          serial: {
            select: {
              id: true,
              serialNumber: true,
              status: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.InventoryTransferInclude;

export type TransferRecord = Prisma.InventoryTransferGetPayload<{
  include: typeof transferInclude;
}>;

type TransferLineInput = {
  productId: string;
  qty: number;
  serialIds?: string[];
};

async function getWarehouseNames(
  prisma: PrismaClient,
  fromWarehouseId: string,
  toWarehouseId: string,
) {
  const warehouses = await prisma.warehouse.findMany({
    where: { id: { in: [fromWarehouseId, toWarehouseId] } },
    select: { id: true, name: true, companyId: true, isActive: true },
  });

  const fromWarehouse = warehouses.find((w) => w.id === fromWarehouseId);
  const toWarehouse = warehouses.find((w) => w.id === toWarehouseId);

  return { fromWarehouse, toWarehouse };
}

async function validateTransferLineStock(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    line: TransferLineInput;
  },
) {
  const product = await prisma.product.findUnique({
    where: { id: input.line.productId },
  });
  if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");

  if (input.line.qty <= 0) throw new Error("INVALID_QUANTITY");

  if (product.serialTracking) {
    const serialIds = input.line.serialIds ?? [];
    if (serialIds.length !== input.line.qty) throw new Error("SERIAL_REQUIRED");

    const serials = await prisma.inventorySerial.findMany({
      where: {
        id: { in: serialIds },
        productId: input.line.productId,
        currentWarehouseId: input.warehouseId,
        status: SerialStatus.AVAILABLE,
        lot: { companyId: input.companyId },
      },
    });
    if (serials.length !== serialIds.length) throw new Error("NEGATIVE_STOCK_BLOCKED");
  } else {
    const lots = await prisma.inventoryLot.findMany({
      where: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.line.productId,
        status: LotStatus.CLOSED,
      },
    });

    const available = lots.reduce((sum, lot) => {
      const received = decimalToNumber(lot.receivedQuantity);
      const damaged = decimalToNumber(lot.damagedQuantity);
      return sum + Math.max(0, received - damaged);
    }, 0);

    if (available < input.line.qty) throw new Error("NEGATIVE_STOCK_BLOCKED");
  }
}

export async function deductNonSerialStock(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    qty: number;
  },
) {
  let remaining = input.qty;
  const lots = await tx.inventoryLot.findMany({
    where: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      status: LotStatus.CLOSED,
    },
    orderBy: { updatedAt: "desc" },
  });

  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Math.max(
      0,
      decimalToNumber(lot.receivedQuantity) - decimalToNumber(lot.damagedQuantity),
    );
    if (available <= 0) continue;

    const deduct = Math.min(available, remaining);
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        receivedQuantity: decimalToNumber(lot.receivedQuantity) - deduct,
      },
    });
    remaining -= deduct;
  }

  if (remaining > 0) throw new Error("NEGATIVE_STOCK_BLOCKED");
}

async function addNonSerialStock(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    qty: number;
    createdById: string;
  },
) {
  let lot = await tx.inventoryLot.findFirst({
    where: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      status: LotStatus.CLOSED,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!lot) {
    const lotNumber = await generateLotNumber(tx);
    lot = await tx.inventoryLot.create({
      data: {
        lotNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        purchaseInvoiceNo: systemPurchaseInvoiceNo(lotNumber),
        purchaseDate: new Date(),
        productId: input.productId,
        quantity: input.qty,
        receivedQuantity: input.qty,
        status: LotStatus.CLOSED,
        createdById: input.createdById,
      },
    });
  } else {
    const nextReceived = decimalToNumber(lot.receivedQuantity) + input.qty;
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        receivedQuantity: nextReceived,
        quantity: Math.max(decimalToNumber(lot.quantity), nextReceived),
        status: LotStatus.CLOSED,
      },
    });
  }

  return lot;
}

export async function listTransfers(
  prisma: PrismaClient,
  companyId: string,
  filters: { direction?: "outgoing" | "incoming" | "all"; status?: TransferStatus },
) {
  const direction = filters.direction ?? "all";

  const where: Prisma.InventoryTransferWhereInput =
    direction === "outgoing"
      ? { fromCompanyId: companyId }
      : direction === "incoming"
        ? { toCompanyId: companyId }
        : {
            OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }],
          };

  return prisma.inventoryTransfer.findMany({
    where: {
      ...where,
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: transferInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function countPendingIncomingTransfers(
  prisma: PrismaClient,
  companyId: string,
) {
  return prisma.inventoryTransfer.count({
    where: {
      toCompanyId: companyId,
      status: { in: [TransferStatus.DISPATCHED, TransferStatus.PARTIALLY_RECEIVED] },
    },
  });
}

export async function getTransferById(
  prisma: PrismaClient,
  transferId: string,
  companyId: string,
) {
  return prisma.inventoryTransfer.findFirst({
    where: {
      id: transferId,
      OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }],
    },
    include: transferInclude,
  });
}

export async function createTransfer(
  prisma: PrismaClient,
  input: {
    fromCompanyId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    notes?: string;
    lines: TransferLineInput[];
    createdById: string;
  },
) {
  if (input.lines.length === 0) throw new Error("LINES_REQUIRED");

  const { fromWarehouse, toWarehouse } = await getWarehouseNames(
    prisma,
    input.fromWarehouseId,
    input.toWarehouseId,
  );

  if (!fromWarehouse?.isActive || fromWarehouse.companyId !== input.fromCompanyId) {
    throw new Error("FROM_WAREHOUSE_NOT_FOUND");
  }
  if (!toWarehouse?.isActive) throw new Error("TO_WAREHOUSE_NOT_FOUND");
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new Error("SAME_WAREHOUSE");
  }

  for (const line of input.lines) {
    await validateTransferLineStock(prisma, {
      companyId: input.fromCompanyId,
      warehouseId: input.fromWarehouseId,
      line,
    });
  }

  const transferNumber = await generateTransferNumber(prisma, input.fromCompanyId);

  return prisma.$transaction(async (tx) => {
    const transfer = await tx.inventoryTransfer.create({
      data: {
        transferNumber,
        fromCompanyId: input.fromCompanyId,
        toCompanyId: toWarehouse.companyId,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        status: TransferStatus.DRAFT,
        notes: input.notes ?? null,
        createdById: input.createdById,
        lines: {
          create: input.lines.map((line) => ({
            productId: line.productId,
            qty: line.qty,
            ...(line.serialIds?.length
              ? {
                  serials: {
                    create: line.serialIds.map((serialId) => ({ serialId })),
                  },
                }
              : {}),
          })),
        },
      },
      include: transferInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_transfers",
      recordId: transfer.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.fromCompanyId,
      newValue: {
        transferNumber: transfer.transferNumber,
        toCompanyId: transfer.toCompanyId,
        lineCount: input.lines.length,
      },
    });

    return transfer;
  });
}

export async function dispatchTransfer(
  prisma: PrismaClient,
  input: {
    transferId: string;
    companyId: string;
    dispatchedById: string;
  },
) {
  const transfer = await prisma.inventoryTransfer.findFirst({
    where: { id: input.transferId, fromCompanyId: input.companyId },
    include: {
      lines: {
        include: {
          product: true,
          serials: { include: { serial: true } },
        },
      },
    },
  });

  if (!transfer) throw new Error("NOT_FOUND");
  if (transfer.status !== TransferStatus.DRAFT) throw new Error("INVALID_STATUS");

  for (const line of transfer.lines) {
    await validateTransferLineStock(prisma, {
      companyId: input.companyId,
      warehouseId: transfer.fromWarehouseId,
      line: {
        productId: line.productId,
        qty: decimalToNumber(line.qty),
        serialIds: line.serials.map((row) => row.serialId),
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    for (const line of transfer.lines) {
      const qty = decimalToNumber(line.qty);

      if (line.product.serialTracking) {
        await tx.inventorySerial.updateMany({
          where: { id: { in: line.serials.map((row) => row.serialId) } },
          data: { status: SerialStatus.DISPATCHED },
        });
      } else {
        await deductNonSerialStock(tx, {
          companyId: input.companyId,
          warehouseId: transfer.fromWarehouseId,
          productId: line.productId,
          qty,
        });
      }

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.TRANSFER,
          companyId: input.companyId,
          productId: line.productId,
          qty,
          fromWarehouseId: transfer.fromWarehouseId,
          toWarehouseId: transfer.toWarehouseId,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          notes: `Dispatched ${transfer.transferNumber}`,
          createdById: input.dispatchedById,
        },
      });
    }

    const updated = await tx.inventoryTransfer.update({
      where: { id: transfer.id },
      data: {
        status: TransferStatus.DISPATCHED,
        dispatchedById: input.dispatchedById,
        dispatchedAt: new Date(),
      },
      include: transferInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_transfers",
      recordId: transfer.id,
      action: "UPDATE",
      performedBy: input.dispatchedById,
      companyId: input.companyId,
      oldValue: { status: TransferStatus.DRAFT },
      newValue: { status: TransferStatus.DISPATCHED },
    });

    return updated;
  });
}

export async function receiveTransfer(
  prisma: PrismaClient,
  input: {
    transferId: string;
    companyId: string;
    lines: { lineId: string; receivedQty: number }[];
    receivedById: string;
  },
) {
  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: input.transferId,
      toCompanyId: input.companyId,
      status: { in: [TransferStatus.DISPATCHED, TransferStatus.PARTIALLY_RECEIVED] },
    },
    include: {
      lines: {
        include: {
          product: true,
          serials: { include: { serial: true } },
        },
      },
    },
  });

  if (!transfer) throw new Error("NOT_FOUND");

  const lineMap = new Map(transfer.lines.map((line) => [line.id, line]));
  let totalReceivedThisRequest = 0;

  for (const item of input.lines) {
    const line = lineMap.get(item.lineId);
    if (!line) throw new Error("LINE_NOT_FOUND");
    if (item.receivedQty <= 0) throw new Error("INVALID_QUANTITY");

    const pending =
      decimalToNumber(line.qty) - decimalToNumber(line.receivedQty);
    if (item.receivedQty > pending) throw new Error("EXCEEDS_PENDING");

    if (line.product.serialTracking && item.receivedQty !== pending) {
      throw new Error("SERIAL_PARTIAL_NOT_SUPPORTED");
    }

    totalReceivedThisRequest += item.receivedQty;
  }

  if (totalReceivedThisRequest <= 0) throw new Error("NO_RECEIPT");

  const isInterCompany = transfer.fromCompanyId !== transfer.toCompanyId;

  return prisma.$transaction(async (tx) => {
    for (const item of input.lines) {
      const line = lineMap.get(item.lineId)!;
      const qty = item.receivedQty;

      if (line.product.serialTracking) {
        const serialIds = line.serials.map((row) => row.serialId);

        if (isInterCompany) {
          const destLot = await addNonSerialStock(tx, {
            companyId: transfer.toCompanyId,
            warehouseId: transfer.toWarehouseId,
            productId: line.productId,
            qty,
            createdById: input.receivedById,
          });

          await tx.inventorySerial.updateMany({
            where: { id: { in: serialIds } },
            data: {
              status: SerialStatus.AVAILABLE,
              currentWarehouseId: transfer.toWarehouseId,
              lotId: destLot.id,
            },
          });
        } else {
          await tx.inventorySerial.updateMany({
            where: { id: { in: serialIds } },
            data: {
              status: SerialStatus.AVAILABLE,
              currentWarehouseId: transfer.toWarehouseId,
            },
          });
        }
      } else {
        await addNonSerialStock(tx, {
          companyId: transfer.toCompanyId,
          warehouseId: transfer.toWarehouseId,
          productId: line.productId,
          qty,
          createdById: input.receivedById,
        });
      }

      await tx.inventoryTransferLine.update({
        where: { id: line.id },
        data: {
          receivedQty: decimalToNumber(line.receivedQty) + qty,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.TRANSFER,
          companyId: transfer.toCompanyId,
          productId: line.productId,
          qty,
          fromWarehouseId: transfer.fromWarehouseId,
          toWarehouseId: transfer.toWarehouseId,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          notes: `Received ${transfer.transferNumber}`,
          createdById: input.receivedById,
        },
      });
    }

    const refreshedLines = await tx.inventoryTransferLine.findMany({
      where: { transferId: transfer.id },
    });

    const allReceived = refreshedLines.every(
      (line) => decimalToNumber(line.receivedQty) >= decimalToNumber(line.qty),
    );
    const anyReceived = refreshedLines.some(
      (line) => decimalToNumber(line.receivedQty) > 0,
    );

    const nextStatus = allReceived
      ? TransferStatus.RECEIVED
      : anyReceived
        ? TransferStatus.PARTIALLY_RECEIVED
        : transfer.status;

    const updated = await tx.inventoryTransfer.update({
      where: { id: transfer.id },
      data: {
        status: nextStatus,
        receivedById: input.receivedById,
        receivedAt: allReceived ? new Date() : transfer.receivedAt,
      },
      include: transferInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_transfers",
      recordId: transfer.id,
      action: "UPDATE",
      performedBy: input.receivedById,
      companyId: input.companyId,
      oldValue: { status: transfer.status },
      newValue: { status: nextStatus },
    });

    return updated;
  });
}

export async function cancelTransfer(
  prisma: PrismaClient,
  input: {
    transferId: string;
    companyId: string;
    cancelledById: string;
  },
) {
  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: input.transferId,
      fromCompanyId: input.companyId,
      status: TransferStatus.DRAFT,
    },
  });

  if (!transfer) throw new Error("NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryTransfer.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.CANCELLED },
      include: transferInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_transfers",
      recordId: transfer.id,
      action: "CANCEL",
      performedBy: input.cancelledById,
      companyId: input.companyId,
      oldValue: { status: TransferStatus.DRAFT },
      newValue: { status: TransferStatus.CANCELLED },
    });

    return updated;
  });
}

export function serializeTransferForRole(
  transfer: TransferRecord,
  includeSerials: boolean,
): TransferRecord {
  if (includeSerials) return transfer;
  return {
    ...transfer,
    lines: transfer.lines.map((line) => ({
      ...line,
      serials: [],
    })),
  };
}

export async function listDestinationWarehouses(
  prisma: PrismaClient,
  userCompanyIds: string[],
) {
  return prisma.warehouse.findMany({
    where: {
      companyId: { in: userCompanyIds },
      isActive: true,
    },
    include: {
      company: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });
}

export async function listAvailableSerialsForTransfer(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
  },
) {
  return prisma.inventorySerial.findMany({
    where: {
      productId: input.productId,
      currentWarehouseId: input.warehouseId,
      status: SerialStatus.AVAILABLE,
      lot: { companyId: input.companyId },
    },
    select: { id: true, serialNumber: true },
    orderBy: { serialNumber: "asc" },
  });
}
