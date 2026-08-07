import {
  InventoryEventType,
  InventoryTransactionType,
  LotStatus,
  ManualStockCondition,
  ManualStockEntryAction,
  ManualStockReason,
  Prisma,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";

import { writeAuditLogTx } from "@/lib/audit";
import { createEvent } from "@/lib/inventory-event-service";
import {
  decimalToNumber,
  generateLotNumber,
  getFinancialYear,
  normalizeSerialNumber,
  systemPurchaseInvoiceNo,
} from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import { MANUAL_STOCK_SOURCE } from "@/lib/manual-stock-constants";

type Tx = Prisma.TransactionClient;

const entryInclude = {
  product: {
    select: {
      id: true,
      displayName: true,
      serialTracking: true,
    },
  },
  warehouse: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { serialNumber: "asc" as const },
    select: {
      id: true,
      serialId: true,
      serialNumber: true,
      fromStatus: true,
      toStatus: true,
    },
  },
} satisfies Prisma.ManualStockEntryInclude;

export type ManualStockEntryRecord = Prisma.ManualStockEntryGetPayload<{
  include: typeof entryInclude;
}>;

function conditionToStatus(condition: ManualStockCondition): SerialStatus {
  return condition === ManualStockCondition.DAMAGED
    ? SerialStatus.DAMAGED
    : SerialStatus.AVAILABLE;
}

function formatReasonNotes(reason: ManualStockReason, notes?: string | null) {
  const base = `Manual stock · ${reason}`;
  return notes?.trim() ? `${base}: ${notes.trim()}` : base;
}

async function generateManualStockEntryNumber(
  tx: Tx,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const prefix = `MSE-${fy}-`;
  const latest = await tx.manualStockEntry.findFirst({
    where: { entryNumber: { startsWith: prefix } },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  const next = latest
    ? Number.parseInt(latest.entryNumber.slice(prefix.length), 10) + 1 || 1
    : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function assertWarehouse(
  tx: Tx,
  companyId: string,
  warehouseId: string,
) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: warehouseId, companyId, isActive: true },
    select: { id: true },
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");
  return warehouse;
}

async function loadProduct(tx: Tx, productId: string) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");
  return product;
}

async function ensureManualLot(
  tx: Tx,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    createdById: string;
    qty: number;
    damagedQty?: number;
  },
) {
  let lot = await tx.inventoryLot.findFirst({
    where: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      purchaseInvoiceNo: { startsWith: "SYS-" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lot) {
    const lotNumber = await generateLotNumber(tx, new Date());
    lot = await tx.inventoryLot.create({
      data: {
        lotNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        purchaseInvoiceNo: systemPurchaseInvoiceNo(`${lotNumber}-MSE`),
        purchaseDate: new Date(),
        productId: input.productId,
        quantity: Math.max(input.qty, 0),
        receivedQuantity: Math.max(input.qty - (input.damagedQty ?? 0), 0),
        damagedQuantity: Math.max(input.damagedQty ?? 0, 0),
        status: LotStatus.CLOSED,
        remarks: "Manual stock entry",
        createdById: input.createdById,
      },
    });
    return lot;
  }

  const nextReceived =
    decimalToNumber(lot.receivedQuantity) +
    Math.max(input.qty - (input.damagedQty ?? 0), 0);
  const nextDamaged =
    decimalToNumber(lot.damagedQuantity) + Math.max(input.damagedQty ?? 0, 0);
  return tx.inventoryLot.update({
    where: { id: lot.id },
    data: {
      receivedQuantity: Math.max(nextReceived, 0),
      damagedQuantity: Math.max(nextDamaged, 0),
      quantity: Math.max(
        decimalToNumber(lot.quantity),
        nextReceived + nextDamaged,
      ),
      status: LotStatus.CLOSED,
    },
  });
}

function normalizeSerialList(serialNumbers: string[]) {
  const normalized = serialNumbers
    .map(normalizeSerialNumber)
    .filter((value) => value.length > 0);
  if (normalized.length === 0) throw new Error("SERIALS_REQUIRED");
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("DUPLICATE_SERIAL_IN_REQUEST");
  }
  return normalized;
}

export async function createManualStockIn(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    serialNumbers: string[];
    condition: ManualStockCondition;
    reason: ManualStockReason;
    notes?: string | null;
    createdById: string;
  },
) {
  const serials = normalizeSerialList(input.serialNumbers);
  const targetStatus = conditionToStatus(input.condition);
  const effectiveDate = new Date();
  effectiveDate.setUTCHours(0, 0, 0, 0);
  const notes = formatReasonNotes(input.reason, input.notes);

  return prisma.$transaction(async (tx) => {
    await assertWarehouse(tx, input.companyId, input.warehouseId);
    const product = await loadProduct(tx, input.productId);
    if (!product.serialTracking) throw new Error("SERIAL_TRACKING_REQUIRED");

    const existing = await tx.inventorySerial.findMany({
      where: { serialNumber: { in: serials } },
      include: {
        lot: { select: { companyId: true } },
      },
    });
    const byNumber = new Map(existing.map((row) => [row.serialNumber, row]));

    for (const serialNumber of serials) {
      const row = byNumber.get(serialNumber);
      if (!row) continue;
      if (row.status !== SerialStatus.REMOVED) {
        throw new Error(`SERIAL_NOT_REMOVABLE:${serialNumber}`);
      }
      if (row.productId !== input.productId) {
        throw new Error(`SERIAL_PRODUCT_MISMATCH:${serialNumber}`);
      }
      if (row.lot.companyId !== input.companyId) {
        throw new Error(`SERIAL_COMPANY_MISMATCH:${serialNumber}`);
      }
    }

    const lot = await ensureManualLot(tx, {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      createdById: input.createdById,
      qty: serials.length,
      damagedQty:
        input.condition === ManualStockCondition.DAMAGED ? serials.length : 0,
    });

    const lineData: Array<{
      serialId: string;
      serialNumber: string;
      fromStatus: SerialStatus | null;
      toStatus: SerialStatus;
    }> = [];

    for (const serialNumber of serials) {
      const existingRow = byNumber.get(serialNumber);
      if (existingRow) {
        const updated = await tx.inventorySerial.update({
          where: { id: existingRow.id },
          data: {
            status: targetStatus,
            currentWarehouseId: input.warehouseId,
            lotId: lot.id,
          },
        });
        lineData.push({
          serialId: updated.id,
          serialNumber: updated.serialNumber,
          fromStatus: SerialStatus.REMOVED,
          toStatus: targetStatus,
        });
      } else {
        const created = await tx.inventorySerial.create({
          data: {
            lotId: lot.id,
            productId: input.productId,
            serialNumber,
            status: targetStatus,
            currentWarehouseId: input.warehouseId,
          },
        });
        lineData.push({
          serialId: created.id,
          serialNumber: created.serialNumber,
          fromStatus: null,
          toStatus: targetStatus,
        });
      }
    }

    const entryNumber = await generateManualStockEntryNumber(tx, effectiveDate);
    const entry = await tx.manualStockEntry.create({
      data: {
        entryNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        action: ManualStockEntryAction.IN,
        reason: input.reason,
        notes: input.notes?.trim() || null,
        condition: input.condition,
        quantity: serials.length,
        createdById: input.createdById,
        lines: {
          create: lineData.map((line) => ({
            serialId: line.serialId,
            serialNumber: line.serialNumber,
            fromStatus: line.fromStatus,
            toStatus: line.toStatus,
          })),
        },
      },
      include: entryInclude,
    });

    const sellableQty =
      input.condition === ManualStockCondition.GOOD ? serials.length : 0;

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.ADJUST,
        companyId: input.companyId,
        productId: input.productId,
        lotId: lot.id,
        qty: sellableQty > 0 ? sellableQty : serials.length,
        toWarehouseId: input.warehouseId,
        referenceType: MANUAL_STOCK_SOURCE,
        referenceId: entry.id,
        notes,
        createdById: input.createdById,
      },
    });

    if (sellableQty > 0) {
      await createEvent(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        eventType: InventoryEventType.MANUAL_ADJUSTMENT_IN,
        quantity: sellableQty,
        effectiveDate,
        sourceType: MANUAL_STOCK_SOURCE,
        sourceId: entry.id,
        sourceNumber: entry.entryNumber,
        notes,
        createdById: input.createdById,
      });
    }

    await writeAuditLogTx(tx, {
      tableName: "manual_stock_entries",
      recordId: entry.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        action: "IN",
        condition: input.condition,
        reason: input.reason,
        serialNumbers: serials,
      },
    });

    return entry;
  });
}

export async function createManualStockOut(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    serialNumbers: string[];
    reason: ManualStockReason;
    notes?: string | null;
    createdById: string;
  },
) {
  const serials = normalizeSerialList(input.serialNumbers);
  const effectiveDate = new Date();
  effectiveDate.setUTCHours(0, 0, 0, 0);
  const notes = formatReasonNotes(input.reason, input.notes);

  return prisma.$transaction(async (tx) => {
    await assertWarehouse(tx, input.companyId, input.warehouseId);
    const product = await loadProduct(tx, input.productId);
    if (!product.serialTracking) throw new Error("SERIAL_TRACKING_REQUIRED");

    const rows = await tx.inventorySerial.findMany({
      where: { serialNumber: { in: serials } },
      include: { lot: { select: { companyId: true } } },
    });
    const byNumber = new Map(rows.map((row) => [row.serialNumber, row]));

    const lineData: Array<{
      serialId: string;
      serialNumber: string;
      fromStatus: SerialStatus;
      toStatus: SerialStatus;
    }> = [];
    let sellableOut = 0;

    for (const serialNumber of serials) {
      const row = byNumber.get(serialNumber);
      if (!row) throw new Error(`SERIAL_NOT_FOUND:${serialNumber}`);
      if (row.productId !== input.productId) {
        throw new Error(`SERIAL_PRODUCT_MISMATCH:${serialNumber}`);
      }
      if (row.lot.companyId !== input.companyId) {
        throw new Error(`SERIAL_COMPANY_MISMATCH:${serialNumber}`);
      }
      if (row.currentWarehouseId !== input.warehouseId) {
        throw new Error(`SERIAL_WAREHOUSE_MISMATCH:${serialNumber}`);
      }
      if (
        row.status !== SerialStatus.AVAILABLE &&
        row.status !== SerialStatus.DAMAGED
      ) {
        throw new Error(`SERIAL_NOT_REMOVABLE:${serialNumber}`);
      }

      await tx.inventorySerial.update({
        where: { id: row.id },
        data: { status: SerialStatus.REMOVED },
      });

      if (row.status === SerialStatus.AVAILABLE) sellableOut += 1;
      lineData.push({
        serialId: row.id,
        serialNumber: row.serialNumber,
        fromStatus: row.status,
        toStatus: SerialStatus.REMOVED,
      });
    }

    const entryNumber = await generateManualStockEntryNumber(tx, effectiveDate);
    const entry = await tx.manualStockEntry.create({
      data: {
        entryNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        action: ManualStockEntryAction.OUT,
        reason: input.reason,
        notes: input.notes?.trim() || null,
        quantity: serials.length,
        createdById: input.createdById,
        lines: {
          create: lineData.map((line) => ({
            serialId: line.serialId,
            serialNumber: line.serialNumber,
            fromStatus: line.fromStatus,
            toStatus: line.toStatus,
          })),
        },
      },
      include: entryInclude,
    });

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.ADJUST,
        companyId: input.companyId,
        productId: input.productId,
        qty: -serials.length,
        fromWarehouseId: input.warehouseId,
        referenceType: MANUAL_STOCK_SOURCE,
        referenceId: entry.id,
        notes,
        createdById: input.createdById,
      },
    });

    if (sellableOut > 0) {
      await createEvent(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        eventType: InventoryEventType.MANUAL_ADJUSTMENT_OUT,
        quantity: sellableOut,
        effectiveDate,
        sourceType: MANUAL_STOCK_SOURCE,
        sourceId: entry.id,
        sourceNumber: entry.entryNumber,
        notes,
        createdById: input.createdById,
      });
    }

    await writeAuditLogTx(tx, {
      tableName: "manual_stock_entries",
      recordId: entry.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        action: "OUT",
        reason: input.reason,
        serialNumbers: serials,
      },
    });

    return entry;
  });
}

export async function createManualConditionChange(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    serialNumbers: string[];
    condition: ManualStockCondition;
    reason: ManualStockReason;
    notes?: string | null;
    createdById: string;
  },
) {
  const serials = normalizeSerialList(input.serialNumbers);
  const targetStatus = conditionToStatus(input.condition);
  const effectiveDate = new Date();
  effectiveDate.setUTCHours(0, 0, 0, 0);
  const notes = formatReasonNotes(input.reason, input.notes);

  return prisma.$transaction(async (tx) => {
    await assertWarehouse(tx, input.companyId, input.warehouseId);
    const product = await loadProduct(tx, input.productId);
    if (!product.serialTracking) throw new Error("SERIAL_TRACKING_REQUIRED");

    const rows = await tx.inventorySerial.findMany({
      where: { serialNumber: { in: serials } },
      include: { lot: { select: { companyId: true } } },
    });
    const byNumber = new Map(rows.map((row) => [row.serialNumber, row]));

    const lineData: Array<{
      serialId: string;
      serialNumber: string;
      fromStatus: SerialStatus;
      toStatus: SerialStatus;
    }> = [];
    let toDamaged = 0;
    let toGood = 0;

    for (const serialNumber of serials) {
      const row = byNumber.get(serialNumber);
      if (!row) throw new Error(`SERIAL_NOT_FOUND:${serialNumber}`);
      if (row.productId !== input.productId) {
        throw new Error(`SERIAL_PRODUCT_MISMATCH:${serialNumber}`);
      }
      if (row.lot.companyId !== input.companyId) {
        throw new Error(`SERIAL_COMPANY_MISMATCH:${serialNumber}`);
      }
      if (row.currentWarehouseId !== input.warehouseId) {
        throw new Error(`SERIAL_WAREHOUSE_MISMATCH:${serialNumber}`);
      }
      if (
        row.status !== SerialStatus.AVAILABLE &&
        row.status !== SerialStatus.DAMAGED
      ) {
        throw new Error(`SERIAL_CONDITION_LOCKED:${serialNumber}`);
      }
      if (row.status === targetStatus) {
        throw new Error(`SERIAL_ALREADY_CONDITION:${serialNumber}`);
      }

      await tx.inventorySerial.update({
        where: { id: row.id },
        data: { status: targetStatus },
      });

      if (targetStatus === SerialStatus.DAMAGED) toDamaged += 1;
      else toGood += 1;

      lineData.push({
        serialId: row.id,
        serialNumber: row.serialNumber,
        fromStatus: row.status,
        toStatus: targetStatus,
      });
    }

    const entryNumber = await generateManualStockEntryNumber(tx, effectiveDate);
    const entry = await tx.manualStockEntry.create({
      data: {
        entryNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        action: ManualStockEntryAction.CHANGE_CONDITION,
        reason: input.reason,
        notes: input.notes?.trim() || null,
        condition: input.condition,
        quantity: serials.length,
        createdById: input.createdById,
        lines: {
          create: lineData.map((line) => ({
            serialId: line.serialId,
            serialNumber: line.serialNumber,
            fromStatus: line.fromStatus,
            toStatus: line.toStatus,
          })),
        },
      },
      include: entryInclude,
    });

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.ADJUST,
        companyId: input.companyId,
        productId: input.productId,
        qty: 0,
        fromWarehouseId: input.warehouseId,
        toWarehouseId: input.warehouseId,
        referenceType: MANUAL_STOCK_SOURCE,
        referenceId: entry.id,
        notes,
        createdById: input.createdById,
      },
    });

    if (toDamaged > 0) {
      await createEvent(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        eventType: InventoryEventType.MANUAL_ADJUSTMENT_OUT,
        quantity: toDamaged,
        effectiveDate,
        sourceType: MANUAL_STOCK_SOURCE,
        sourceId: entry.id,
        sourceNumber: entry.entryNumber,
        notes: `${notes} (Good → Damaged)`,
        createdById: input.createdById,
      });
    }
    if (toGood > 0) {
      await createEvent(tx, {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        eventType: InventoryEventType.MANUAL_ADJUSTMENT_IN,
        quantity: toGood,
        effectiveDate,
        sourceType: MANUAL_STOCK_SOURCE,
        sourceId: entry.id,
        sourceNumber: entry.entryNumber,
        notes: `${notes} (Damaged → Good)`,
        createdById: input.createdById,
      });
    }

    await writeAuditLogTx(tx, {
      tableName: "manual_stock_entries",
      recordId: entry.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        action: "CHANGE_CONDITION",
        condition: input.condition,
        reason: input.reason,
        serialNumbers: serials,
      },
    });

    return entry;
  });
}

export async function createManualQtyAdjust(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    direction: "IN" | "OUT";
    qty: number;
    reason: ManualStockReason;
    notes?: string | null;
    createdById: string;
  },
) {
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    throw new Error("INVALID_QUANTITY");
  }

  const signedQty = input.direction === "IN" ? input.qty : -input.qty;
  const effectiveDate = new Date();
  effectiveDate.setUTCHours(0, 0, 0, 0);
  const notes = formatReasonNotes(input.reason, input.notes);

  if (signedQty < 0) {
    const stock = await getWarehouseStockForProduct(
      prisma,
      input.companyId,
      input.productId,
      input.warehouseId,
    );
    if (stock.availableStock + signedQty < 0) {
      throw new Error("NEGATIVE_STOCK_BLOCKED");
    }
  }

  return prisma.$transaction(async (tx) => {
    await assertWarehouse(tx, input.companyId, input.warehouseId);
    const product = await loadProduct(tx, input.productId);
    if (product.serialTracking) throw new Error("USE_SERIAL_FLOW");

    let lot = await tx.inventoryLot.findFirst({
      where: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lot) {
      if (signedQty < 0) throw new Error("NEGATIVE_STOCK_BLOCKED");
      const lotNumber = await generateLotNumber(tx, new Date());
      lot = await tx.inventoryLot.create({
        data: {
          lotNumber,
          companyId: input.companyId,
          warehouseId: input.warehouseId,
          purchaseInvoiceNo: systemPurchaseInvoiceNo(`${lotNumber}-MSE`),
          purchaseDate: new Date(),
          productId: input.productId,
          quantity: input.qty,
          receivedQuantity: input.qty,
          status: LotStatus.CLOSED,
          remarks: "Manual stock entry",
          createdById: input.createdById,
        },
      });
    } else {
      const nextReceived = Math.max(
        0,
        decimalToNumber(lot.receivedQuantity) + signedQty,
      );
      lot = await tx.inventoryLot.update({
        where: { id: lot.id },
        data: {
          receivedQuantity: nextReceived,
          quantity: Math.max(decimalToNumber(lot.quantity), nextReceived),
          status: LotStatus.CLOSED,
        },
      });
    }

    const entryNumber = await generateManualStockEntryNumber(tx, effectiveDate);
    const entry = await tx.manualStockEntry.create({
      data: {
        entryNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        action:
          input.direction === "IN"
            ? ManualStockEntryAction.IN
            : ManualStockEntryAction.OUT,
        reason: input.reason,
        notes: input.notes?.trim() || null,
        quantity: input.qty,
        createdById: input.createdById,
      },
      include: entryInclude,
    });

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.ADJUST,
        companyId: input.companyId,
        productId: input.productId,
        lotId: lot.id,
        qty: signedQty,
        toWarehouseId: signedQty > 0 ? input.warehouseId : null,
        fromWarehouseId: signedQty < 0 ? input.warehouseId : null,
        referenceType: MANUAL_STOCK_SOURCE,
        referenceId: entry.id,
        notes,
        createdById: input.createdById,
      },
    });

    await createEvent(tx, {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      eventType:
        signedQty > 0
          ? InventoryEventType.MANUAL_ADJUSTMENT_IN
          : InventoryEventType.MANUAL_ADJUSTMENT_OUT,
      quantity: input.qty,
      effectiveDate,
      sourceType: MANUAL_STOCK_SOURCE,
      sourceId: entry.id,
      sourceNumber: entry.entryNumber,
      notes,
      createdById: input.createdById,
    });

    await writeAuditLogTx(tx, {
      tableName: "manual_stock_entries",
      recordId: entry.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        action: input.direction,
        qty: input.qty,
        reason: input.reason,
      },
    });

    return entry;
  });
}

export async function listManualStockEntries(
  prisma: PrismaClient,
  companyId: string,
  filters?: { limit?: number },
) {
  return prisma.manualStockEntry.findMany({
    where: { companyId },
    include: entryInclude,
    orderBy: { createdAt: "desc" },
    take: filters?.limit ?? 100,
  });
}

export function serializeManualStockEntry(entry: ManualStockEntryRecord) {
  return {
    ...entry,
    quantity: decimalToNumber(entry.quantity),
    createdAt: entry.createdAt.toISOString(),
  };
}
