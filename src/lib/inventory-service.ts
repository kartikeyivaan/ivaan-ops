import {
  InventoryEventStatus,
  InventoryEventType,
  InventoryTransactionType,
  LotStatus,
  Prisma,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  calculateTotalPurchaseCost,
  decimalToNumber,
  emptyStockSummary,
  generateLotNumber,
  normalizePurchaseInvoiceNo,
  normalizeSerialNumber,
  systemPurchaseInvoiceNo,
  type StockSummary,
  validateInwardQuantities,
} from "@/lib/inventory";
import { writeAuditLogTx } from "@/lib/audit";
import { toSignedInventoryQuantity } from "@/lib/inventory-events";

const lotInclude = {
  company: true,
  product: {
    include: {
      category: true,
      brand: true,
    },
  },
  warehouse: true,
  vendor: true,
  createdBy: { select: { id: true, name: true, email: true } },
  serials: true,
} satisfies Prisma.InventoryLotInclude;

export type InventoryLotRecord = Prisma.InventoryLotGetPayload<{
  include: typeof lotInclude;
}>;

function serializeTimestampRecord<T extends { createdAt: Date; updatedAt: Date }>(
  record: T,
) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type StockByWarehouse = StockSummary & {
  warehouseId: string;
  warehouseName: string;
};

export type ProductStockSummary = {
  productId: string;
  displayName: string;
  brandName: string;
  categoryName: string;
  serialTracking: boolean;
  consolidated: StockSummary;
  warehouses: StockByWarehouse[];
};

function sumStock(rows: StockSummary[]): StockSummary {
  return rows.reduce(
    (acc, row) => ({
      availableStock: acc.availableStock + row.availableStock,
      incomingStock: acc.incomingStock + row.incomingStock,
      bookedStock: acc.bookedStock + row.bookedStock,
      damagedStock: acc.damagedStock + row.damagedStock,
    }),
    emptyStockSummary(),
  );
}

export async function getWarehouseStockForProduct(
  prisma: PrismaClient,
  companyId: string,
  productId: string,
  warehouseId: string,
): Promise<StockSummary> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return emptyStockSummary();

  const lots = await prisma.inventoryLot.findMany({
    where: { companyId, warehouseId, productId },
  });

  let incomingStock = 0;
  let nonSerialAvailable = 0;
  let nonSerialDamaged = 0;

  for (const lot of lots) {
    const quantity = decimalToNumber(lot.quantity);
    const received = decimalToNumber(lot.receivedQuantity);
    const damaged = decimalToNumber(lot.damagedQuantity);

    if (lot.status === LotStatus.INCOMING) {
      incomingStock += Math.max(0, quantity - received - damaged);
    }

    if (!product.serialTracking) {
      nonSerialAvailable += Math.max(0, received - damaged);
      nonSerialDamaged += damaged;
    }
  }

  if (product.serialTracking) {
    const [availableCount, bookedCount, damagedCount] = await Promise.all([
      prisma.inventorySerial.count({
        where: {
          productId,
          currentWarehouseId: warehouseId,
          status: SerialStatus.AVAILABLE,
          lot: { companyId },
        },
      }),
      prisma.inventorySerial.count({
        where: {
          productId,
          currentWarehouseId: warehouseId,
          status: SerialStatus.BOOKED,
          lot: { companyId },
        },
      }),
      prisma.inventorySerial.count({
        where: {
          productId,
          currentWarehouseId: warehouseId,
          status: SerialStatus.DAMAGED,
          lot: { companyId },
        },
      }),
    ]);

    return {
      availableStock: availableCount,
      incomingStock,
      bookedStock: bookedCount,
      damagedStock: damagedCount,
    };
  }

  return {
    availableStock: nonSerialAvailable,
    incomingStock,
    bookedStock: 0,
    damagedStock: nonSerialDamaged,
  };
}

export async function getProductStockSummary(
  prisma: PrismaClient,
  companyId: string,
  productId: string,
): Promise<StockSummary> {
  const warehouses = await prisma.warehouse.findMany({
    where: { companyId, isActive: true },
  });

  const rows = await Promise.all(
    warehouses.map((warehouse) =>
      getWarehouseStockForProduct(prisma, companyId, productId, warehouse.id),
    ),
  );

  return sumStock(rows);
}

export async function listStockSummary(
  prisma: PrismaClient,
  companyId: string,
  filters: { q?: string; warehouseId?: string },
): Promise<ProductStockSummary[]> {
  const warehouses = await prisma.warehouse.findMany({
    where: {
      companyId,
      isActive: true,
      ...(filters.warehouseId ? { id: filters.warehouseId } : {}),
    },
    orderBy: { name: "asc" },
  });

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(filters.q
        ? {
            OR: [
              { displayName: { contains: filters.q, mode: "insensitive" } },
              { brand: { name: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { brand: true, category: true },
    orderBy: { displayName: "asc" },
  });

  const summaries: ProductStockSummary[] = [];

  for (const product of products) {
    const warehouseRows: StockByWarehouse[] = [];

    for (const warehouse of warehouses) {
      const stock = await getWarehouseStockForProduct(
        prisma,
        companyId,
        product.id,
        warehouse.id,
      );
      warehouseRows.push({
        ...stock,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
      });
    }

    summaries.push({
      productId: product.id,
      displayName: product.displayName,
      brandName: product.brand.name,
      categoryName: product.category.name,
      serialTracking: product.serialTracking,
      consolidated: sumStock(warehouseRows),
      warehouses: warehouseRows,
    });
  }

  return summaries;
}

export async function listIncomingLots(
  prisma: PrismaClient,
  companyId: string,
  filters: { status?: LotStatus; warehouseId?: string },
) {
  return prisma.inventoryLot.findMany({
    where: {
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    },
    include: lotInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getLotById(prisma: PrismaClient, lotId: string, companyId: string) {
  return prisma.inventoryLot.findFirst({
    where: { id: lotId, companyId },
    include: lotInclude,
  });
}

export type SimilarIncomingLotMatch = {
  id: string;
  lotNumber: string;
  purchaseInvoiceNo: string;
  productName: string;
  vendorName: string | null;
  purchaseDate: string;
  quantity: number;
};

export class SimilarIncomingLotError extends Error {
  readonly matches: SimilarIncomingLotMatch[];

  constructor(matches: SimilarIncomingLotMatch[]) {
    super("SIMILAR_ENTRY_EXISTS");
    this.matches = matches;
  }
}

export async function findDuplicatePurchaseInvoice(
  prisma: PrismaClient | Prisma.TransactionClient,
  purchaseInvoiceNo: string,
  excludeLotId?: string,
) {
  const normalized = normalizePurchaseInvoiceNo(purchaseInvoiceNo);
  if (!normalized) return null;

  return prisma.inventoryLot.findFirst({
    where: {
      purchaseInvoiceNo: { equals: normalized, mode: "insensitive" },
      ...(excludeLotId ? { id: { not: excludeLotId } } : {}),
    },
    select: {
      id: true,
      lotNumber: true,
      purchaseInvoiceNo: true,
    },
  });
}

export async function findSimilarIncomingLots(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    companyId: string;
    warehouseId: string;
    vendorId?: string | null;
    productId: string;
    purchaseDate: Date;
    expectedMinDate?: Date | null;
    expectedMaxDate?: Date | null;
    quantity: number;
    unitPurchaseRate: number;
    excludeLotId?: string;
  },
): Promise<SimilarIncomingLotMatch[]> {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      vendorId: input.vendorId ?? null,
      purchaseDate: input.purchaseDate,
      quantity: input.quantity,
      unitPurchaseRate: input.unitPurchaseRate,
      ...(input.excludeLotId ? { id: { not: input.excludeLotId } } : {}),
    },
    include: {
      product: { select: { displayName: true } },
      vendor: { select: { vendorName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return lots.map((lot) => ({
    id: lot.id,
    lotNumber: lot.lotNumber,
    purchaseInvoiceNo: lot.purchaseInvoiceNo,
    productName: lot.product.displayName,
    vendorName: lot.vendor?.vendorName ?? null,
    purchaseDate: lot.purchaseDate.toISOString().slice(0, 10),
    quantity: decimalToNumber(lot.quantity),
  }));
}

async function validateIncomingLotUniqueness(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    purchaseInvoiceNo: string;
    companyId: string;
    warehouseId: string;
    vendorId?: string | null;
    productId: string;
    purchaseDate: Date;
    quantity: number;
    unitPurchaseRate: number;
    confirmSimilar?: boolean;
    excludeLotId?: string;
  },
) {
  const purchaseInvoiceNo = normalizePurchaseInvoiceNo(input.purchaseInvoiceNo);
  if (!purchaseInvoiceNo) {
    throw new Error("PURCHASE_INVOICE_REQUIRED");
  }

  const duplicateInvoice = await findDuplicatePurchaseInvoice(
    prisma,
    purchaseInvoiceNo,
    input.excludeLotId,
  );
  if (duplicateInvoice) {
    throw new Error("DUPLICATE_PURCHASE_INVOICE");
  }

  if (!input.confirmSimilar) {
    const similarLots = await findSimilarIncomingLots(prisma, {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      vendorId: input.vendorId,
      productId: input.productId,
      purchaseDate: input.purchaseDate,
      quantity: input.quantity,
      unitPurchaseRate: input.unitPurchaseRate,
      excludeLotId: input.excludeLotId,
    });

    if (similarLots.length > 0) {
      throw new SimilarIncomingLotError(similarLots);
    }
  }

  return purchaseInvoiceNo;
}

export async function createIncomingLot(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    vendorId?: string | null;
    purchaseInvoiceNo?: string | null;
    purchaseDate: Date;
    expectedMinDate?: Date | null;
    expectedMaxDate?: Date | null;
    productId: string;
    quantity: number;
    unitPurchaseRate: number;
    transportCharges?: number;
    commissionCharges?: number;
    createdById: string;
    confirmSimilar?: boolean;
  },
) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: input.companyId, isActive: true },
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");

  if (input.quantity <= 0) throw new Error("INVALID_QUANTITY");
  if (input.expectedMinDate && input.expectedMaxDate && input.expectedMinDate > input.expectedMaxDate) {
    throw new Error("INVALID_ARRIVAL_WINDOW");
  }

  const transportCharges = input.transportCharges ?? 0;
  const commissionCharges = input.commissionCharges ?? 0;
  const totalPurchaseCost = calculateTotalPurchaseCost({
    quantity: input.quantity,
    unitPurchaseRate: input.unitPurchaseRate,
    gstRate: decimalToNumber(product.gstRate),
    transportCharges,
    commissionCharges,
  });

  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, isActive: true },
    });
    if (!vendor) throw new Error("VENDOR_NOT_FOUND");
  }

  const purchaseInvoiceNo = await validateIncomingLotUniqueness(prisma, {
    purchaseInvoiceNo: input.purchaseInvoiceNo ?? "",
    companyId: input.companyId,
    warehouseId: input.warehouseId,
    vendorId: input.vendorId,
    productId: input.productId,
    purchaseDate: input.purchaseDate,
    quantity: input.quantity,
    unitPurchaseRate: input.unitPurchaseRate,
    confirmSimilar: input.confirmSimilar,
  });

  return prisma.$transaction(async (tx) => {
    const lotNumber = await generateLotNumber(tx, input.purchaseDate);
    const lot = await tx.inventoryLot.create({
      data: {
        lotNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        vendorId: input.vendorId ?? null,
        purchaseInvoiceNo,
        purchaseDate: input.purchaseDate,
        expectedMinDate: input.expectedMinDate,
        expectedMaxDate: input.expectedMaxDate,
        productId: input.productId,
        quantity: input.quantity,
        unitPurchaseRate: input.unitPurchaseRate,
        transportCharges,
        commissionCharges,
        totalPurchaseCost,
        status: LotStatus.INCOMING,
        createdById: input.createdById,
      },
      include: lotInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_lots",
      recordId: lot.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        lotNumber: lot.lotNumber,
        productId: lot.productId,
        quantity: input.quantity,
        unitPurchaseRate: input.unitPurchaseRate,
        totalPurchaseCost,
      },
    });

    await tx.inventoryEvent.create({
      data: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        eventType: InventoryEventType.PURCHASE_INCOMING,
        quantity: input.quantity,
        quantityEffect: toSignedInventoryQuantity(InventoryEventType.PURCHASE_INCOMING, input.quantity),
        effectiveDate: input.expectedMaxDate ?? input.expectedMinDate ?? input.purchaseDate,
        expectedMinDate: input.expectedMinDate,
        expectedMaxDate: input.expectedMaxDate,
        sourceType: "INVENTORY_LOT",
        sourceId: lot.id,
        sourceNumber: lot.lotNumber,
        status: InventoryEventStatus.ACTIVE,
        createdById: input.createdById,
      },
    });

    return lot;
  });
}

export function canModifyIncomingLot(lot: {
  status: LotStatus;
  receivedQuantity: Prisma.Decimal | number;
  damagedQuantity: Prisma.Decimal | number;
}) {
  return (
    lot.status === LotStatus.INCOMING &&
    decimalToNumber(lot.receivedQuantity) === 0 &&
    decimalToNumber(lot.damagedQuantity) === 0
  );
}

export async function updateIncomingLot(
  prisma: PrismaClient,
  lotId: string,
  companyId: string,
  input: {
    warehouseId: string;
    vendorId?: string | null;
    purchaseInvoiceNo?: string | null;
    purchaseDate: Date;
    expectedMinDate?: Date | null;
    expectedMaxDate?: Date | null;
    productId: string;
    quantity: number;
    unitPurchaseRate: number;
    transportCharges?: number;
    commissionCharges?: number;
    updatedById: string;
    confirmSimilar?: boolean;
  },
) {
  const lot = await prisma.inventoryLot.findFirst({
    where: { id: lotId, companyId },
  });
  if (!lot) throw new Error("NOT_FOUND");
  if (!canModifyIncomingLot(lot)) throw new Error("LOT_NOT_EDITABLE");

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, companyId, isActive: true },
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");

  if (input.quantity <= 0) throw new Error("INVALID_QUANTITY");
  if (input.expectedMinDate && input.expectedMaxDate && input.expectedMinDate > input.expectedMaxDate) {
    throw new Error("INVALID_ARRIVAL_WINDOW");
  }

  const transportCharges = input.transportCharges ?? 0;
  const commissionCharges = input.commissionCharges ?? 0;
  const totalPurchaseCost = calculateTotalPurchaseCost({
    quantity: input.quantity,
    unitPurchaseRate: input.unitPurchaseRate,
    gstRate: decimalToNumber(product.gstRate),
    transportCharges,
    commissionCharges,
  });

  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, isActive: true },
    });
    if (!vendor) throw new Error("VENDOR_NOT_FOUND");
  }

  const purchaseInvoiceNo = await validateIncomingLotUniqueness(prisma, {
    purchaseInvoiceNo: input.purchaseInvoiceNo ?? "",
    companyId,
    warehouseId: input.warehouseId,
    vendorId: input.vendorId,
    productId: input.productId,
    purchaseDate: input.purchaseDate,
    quantity: input.quantity,
    unitPurchaseRate: input.unitPurchaseRate,
    confirmSimilar: input.confirmSimilar,
    excludeLotId: lotId,
  });

  return prisma.$transaction(async (tx) => {
    const updatedLot = await tx.inventoryLot.update({
      where: { id: lotId },
      data: {
        warehouseId: input.warehouseId,
        vendorId: input.vendorId ?? null,
        purchaseInvoiceNo,
        purchaseDate: input.purchaseDate,
        expectedMinDate: input.expectedMinDate,
        expectedMaxDate: input.expectedMaxDate,
        productId: input.productId,
        quantity: input.quantity,
        unitPurchaseRate: input.unitPurchaseRate,
        transportCharges,
        commissionCharges,
        totalPurchaseCost,
      },
      include: lotInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_lots",
      recordId: lotId,
      action: "UPDATE",
      performedBy: input.updatedById,
      companyId,
      oldValue: {
        lotNumber: lot.lotNumber,
        productId: lot.productId,
        quantity: decimalToNumber(lot.quantity),
      },
      newValue: {
        lotNumber: lot.lotNumber,
        productId: input.productId,
        quantity: input.quantity,
        totalPurchaseCost,
      },
    });

    const event = await tx.inventoryEvent.findFirst({
      where: {
        sourceType: "INVENTORY_LOT",
        sourceId: lotId,
        eventType: InventoryEventType.PURCHASE_INCOMING,
        status: { not: InventoryEventStatus.CANCELLED },
      },
    });
    const eventData = {
      companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity: input.quantity,
      quantityEffect: toSignedInventoryQuantity(InventoryEventType.PURCHASE_INCOMING, input.quantity),
      effectiveDate: input.expectedMaxDate ?? input.expectedMinDate ?? input.purchaseDate,
      expectedMinDate: input.expectedMinDate,
      expectedMaxDate: input.expectedMaxDate,
      sourceType: "INVENTORY_LOT",
      sourceId: lotId,
      sourceNumber: lot.lotNumber,
      status: InventoryEventStatus.ACTIVE,
      updatedById: input.updatedById,
    };
    if (event) {
      await tx.inventoryEvent.update({ where: { id: event.id }, data: eventData });
    } else {
      await tx.inventoryEvent.create({
        data: { ...eventData, eventType: InventoryEventType.PURCHASE_INCOMING, createdById: input.updatedById },
      });
    }

    return updatedLot;
  });
}

export async function deleteIncomingLot(
  prisma: PrismaClient,
  lotId: string,
  companyId: string,
  deletedById: string,
) {
  const lot = await prisma.inventoryLot.findFirst({
    where: { id: lotId, companyId },
    include: { serials: true, transactions: true },
  });
  if (!lot) throw new Error("NOT_FOUND");
  if (!canModifyIncomingLot(lot)) throw new Error("LOT_NOT_EDITABLE");
  if (lot.serials.length > 0) throw new Error("LOT_HAS_SERIALS");
  if (lot.transactions.length > 0) throw new Error("LOT_HAS_RECEIPTS");

  return prisma.$transaction(async (tx) => {
    await writeAuditLogTx(tx, {
      tableName: "inventory_lots",
      recordId: lotId,
      action: "CANCEL",
      performedBy: deletedById,
      companyId,
      reference: lot.lotNumber,
      oldValue: {
        lotNumber: lot.lotNumber,
        productId: lot.productId,
        quantity: decimalToNumber(lot.quantity),
        deleted: true,
      },
    });

    await tx.inventoryEvent.updateMany({
      where: { sourceType: "INVENTORY_LOT", sourceId: lotId, status: { not: InventoryEventStatus.CANCELLED } },
      data: {
        status: InventoryEventStatus.CANCELLED,
        cancellationReason: "Incoming lot deleted",
        cancelledAt: new Date(),
        updatedById: deletedById,
      },
    });

    await tx.inventoryLot.delete({ where: { id: lotId } });
  });
}

export async function receiveMaterial(
  prisma: PrismaClient,
  input: {
    lotId: string;
    companyId: string;
    receivedQty: number;
    damagedQty: number;
    serialNumbers?: string[];
    createdById: string;
  },
) {
  const lot = await prisma.inventoryLot.findFirst({
    where: { id: input.lotId, companyId: input.companyId },
    include: { product: true, serials: true },
  });
  if (!lot) throw new Error("NOT_FOUND");
  if (lot.status === LotStatus.CLOSED) throw new Error("LOT_CLOSED");

  const quantity = decimalToNumber(lot.quantity);
  const receivedQuantity = decimalToNumber(lot.receivedQuantity);
  const damagedQuantity = decimalToNumber(lot.damagedQuantity);

  const validationError = validateInwardQuantities({
    quantity,
    receivedQuantity,
    damagedQuantity,
    receivedQty: input.receivedQty,
    damagedQty: input.damagedQty,
  });
  if (validationError) throw new Error(validationError);

  if (lot.product.serialTracking) {
    if (input.receivedQty <= 0) {
      throw new Error("Serial-tracked products require received quantity.");
    }
    const serials = (input.serialNumbers ?? []).map(normalizeSerialNumber);
    if (serials.length !== input.receivedQty) {
      throw new Error("SERIAL_COUNT_MISMATCH");
    }
    if (new Set(serials).size !== serials.length) {
      throw new Error("DUPLICATE_SERIAL_IN_REQUEST");
    }

    const existing = await prisma.inventorySerial.findMany({
      where: { serialNumber: { in: serials } },
      select: { serialNumber: true },
    });
    if (existing.length > 0) {
      throw new Error("DUPLICATE_SERIAL");
    }
  }

  return prisma.$transaction(async (tx) => {
    const nextReceived = receivedQuantity + input.receivedQty;
    const nextDamaged = damagedQuantity + input.damagedQty;
    const isComplete = nextReceived + nextDamaged >= quantity;

    const updatedLot = await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        receivedQuantity: nextReceived,
        damagedQuantity: nextDamaged,
        status: isComplete ? LotStatus.CLOSED : LotStatus.INCOMING,
      },
      include: lotInclude,
    });

    if (input.receivedQty > 0) {
      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.INWARD,
          companyId: input.companyId,
          productId: lot.productId,
          lotId: lot.id,
          qty: input.receivedQty,
          toWarehouseId: lot.warehouseId,
          referenceType: "LOT",
          referenceId: lot.id,
          createdById: input.createdById,
        },
      });

      if (lot.product.serialTracking) {
        const serials = (input.serialNumbers ?? []).map(normalizeSerialNumber);
        await tx.inventorySerial.createMany({
          data: serials.map((serialNumber) => ({
            lotId: lot.id,
            productId: lot.productId,
            serialNumber,
            status: SerialStatus.AVAILABLE,
            currentWarehouseId: lot.warehouseId,
          })),
        });
      }
    }

    if (input.damagedQty > 0) {
      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.DAMAGE,
          companyId: input.companyId,
          productId: lot.productId,
          lotId: lot.id,
          qty: input.damagedQty,
          fromWarehouseId: lot.warehouseId,
          referenceType: "LOT",
          referenceId: lot.id,
          notes: "Damaged during inwarding",
          createdById: input.createdById,
        },
      });
    }

    await writeAuditLogTx(tx, {
      tableName: "inventory_lots",
      recordId: lot.id,
      action: "UPDATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      oldValue: {
        receivedQuantity,
        damagedQuantity,
        status: lot.status,
      },
      newValue: {
        receivedQuantity: nextReceived,
        damagedQuantity: nextDamaged,
        status: updatedLot.status,
      },
    });

    return updatedLot;
  });
}

export async function reportDamage(
  prisma: PrismaClient,
  input: {
    companyId: string;
    productId: string;
    warehouseId: string;
    qty: number;
    serialIds?: string[];
    notes?: string;
    createdById: string;
  },
) {
  if (input.qty <= 0) throw new Error("INVALID_QUANTITY");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  if (product.serialTracking) {
    const serialIds = input.serialIds ?? [];
    if (serialIds.length !== input.qty) throw new Error("SERIAL_REQUIRED");

    const serials = await prisma.inventorySerial.findMany({
      where: {
        id: { in: serialIds },
        productId: input.productId,
        currentWarehouseId: input.warehouseId,
        status: SerialStatus.AVAILABLE,
        lot: { companyId: input.companyId },
      },
    });
    if (serials.length !== serialIds.length) throw new Error("NEGATIVE_STOCK_BLOCKED");
  } else {
    const stock = await getWarehouseStockForProduct(
      prisma,
      input.companyId,
      input.productId,
      input.warehouseId,
    );
    if (stock.availableStock < input.qty) throw new Error("NEGATIVE_STOCK_BLOCKED");
  }

  return prisma.$transaction(async (tx) => {
    if (product.serialTracking) {
      await tx.inventorySerial.updateMany({
        where: { id: { in: input.serialIds } },
        data: { status: SerialStatus.DAMAGED },
      });
    } else {
      const lot = await tx.inventoryLot.findFirst({
        where: {
          companyId: input.companyId,
          warehouseId: input.warehouseId,
          productId: input.productId,
          status: LotStatus.CLOSED,
        },
        orderBy: { updatedAt: "desc" },
      });
      if (lot) {
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: {
            damagedQuantity: decimalToNumber(lot.damagedQuantity) + input.qty,
            receivedQuantity: Math.max(
              0,
              decimalToNumber(lot.receivedQuantity) - input.qty,
            ),
          },
        });
      }
    }

    const transaction = await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.DAMAGE,
        companyId: input.companyId,
        productId: input.productId,
        qty: input.qty,
        fromWarehouseId: input.warehouseId,
        referenceType: "DAMAGE",
        notes: input.notes,
        createdById: input.createdById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_transactions",
      recordId: transaction.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        qty: input.qty,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    });

    return transaction;
  });
}

export async function adjustStock(
  prisma: PrismaClient,
  input: {
    companyId: string;
    productId: string;
    warehouseId: string;
    qty: number;
    notes?: string;
    createdById: string;
  },
) {
  if (input.qty === 0) throw new Error("INVALID_QUANTITY");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (product.serialTracking) {
    throw new Error("SERIAL_ADJUST_NOT_SUPPORTED");
  }

  if (input.qty < 0) {
    const stock = await getWarehouseStockForProduct(
      prisma,
      input.companyId,
      input.productId,
      input.warehouseId,
    );
    if (stock.availableStock + input.qty < 0) {
      throw new Error("NEGATIVE_STOCK_BLOCKED");
    }
  }

  return prisma.$transaction(async (tx) => {
    let lot = await tx.inventoryLot.findFirst({
      where: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
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
          purchaseInvoiceNo: systemPurchaseInvoiceNo(lotNumber),
          purchaseDate: new Date(),
          productId: input.productId,
          quantity: Math.abs(input.qty),
          receivedQuantity: Math.max(0, input.qty),
          status: LotStatus.CLOSED,
          createdById: input.createdById,
        },
      });
    } else {
      const nextReceived = Math.max(0, decimalToNumber(lot.receivedQuantity) + input.qty);
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: {
          receivedQuantity: nextReceived,
          quantity: Math.max(decimalToNumber(lot.quantity), nextReceived),
          status: LotStatus.CLOSED,
        },
      });
    }

    const transaction = await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.ADJUST,
        companyId: input.companyId,
        productId: input.productId,
        lotId: lot.id,
        qty: input.qty,
        toWarehouseId: input.qty > 0 ? input.warehouseId : null,
        fromWarehouseId: input.qty < 0 ? input.warehouseId : null,
        referenceType: "ADJUST",
        notes: input.notes,
        createdById: input.createdById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_transactions",
      recordId: transaction.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: { qty: input.qty, notes: input.notes },
    });

    return transaction;
  });
}

export async function listLedger(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    productId?: string;
    warehouseId?: string;
    transactionType?: InventoryTransactionType;
    limit?: number;
  },
) {
  return prisma.inventoryTransaction.findMany({
    where: {
      companyId,
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.transactionType ? { transactionType: filters.transactionType } : {}),
      ...(filters.warehouseId
        ? {
            OR: [
              { fromWarehouseId: filters.warehouseId },
              { toWarehouseId: filters.warehouseId },
            ],
          }
        : {}),
    },
    include: {
      product: { select: { id: true, displayName: true } },
      lot: { select: { id: true, lotNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 100,
  });
}

export async function listVendors(
  prisma: PrismaClient,
  options?: { includeInactive?: boolean },
) {
  return prisma.vendor.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: { vendorName: "asc" },
  });
}

export async function getVendorById(prisma: PrismaClient, vendorId: string) {
  return prisma.vendor.findUnique({ where: { id: vendorId } });
}

export async function createVendor(
  prisma: PrismaClient,
  input: {
    vendorName: string;
    gst?: string;
    address?: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
  },
) {
  return prisma.vendor.create({
    data: {
      vendorName: input.vendorName.trim(),
      gst: input.gst || null,
      address: input.address || null,
      contactPerson: input.contactPerson || null,
      mobile: input.mobile || null,
      email: input.email || null,
    },
  });
}

export async function updateVendor(
  prisma: PrismaClient,
  vendorId: string,
  input: {
    vendorName: string;
    gst?: string;
    address?: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    isActive: boolean;
  },
) {
  return prisma.vendor.update({
    where: { id: vendorId },
    data: {
      vendorName: input.vendorName.trim(),
      gst: input.gst || null,
      address: input.address || null,
      contactPerson: input.contactPerson || null,
      mobile: input.mobile || null,
      email: input.email || null,
      isActive: input.isActive,
    },
  });
}

export function serializeLotForRole(
  lot: InventoryLotRecord,
  includeSerials: boolean,
) {
  return {
    ...lot,
    quantity: decimalToNumber(lot.quantity),
    unitPurchaseRate: decimalToNumber(lot.unitPurchaseRate),
    transportCharges: decimalToNumber(lot.transportCharges),
    commissionCharges: decimalToNumber(lot.commissionCharges),
    totalPurchaseCost: decimalToNumber(lot.totalPurchaseCost),
    receivedQuantity: decimalToNumber(lot.receivedQuantity),
    damagedQuantity: decimalToNumber(lot.damagedQuantity),
    purchaseDate: lot.purchaseDate.toISOString(),
    expectedMinDate: lot.expectedMinDate?.toISOString() ?? null,
    expectedMaxDate: lot.expectedMaxDate?.toISOString() ?? null,
    createdAt: lot.createdAt.toISOString(),
    updatedAt: lot.updatedAt.toISOString(),
    product: {
      ...serializeTimestampRecord(lot.product),
      capacity: decimalToNumber(lot.product.capacity),
      gstRate: decimalToNumber(lot.product.gstRate),
      category: serializeTimestampRecord(lot.product.category),
      brand: serializeTimestampRecord(lot.product.brand),
    },
    warehouse: serializeTimestampRecord(lot.warehouse),
    company: serializeTimestampRecord(lot.company),
    vendor: lot.vendor ? serializeTimestampRecord(lot.vendor) : null,
    createdBy: lot.createdBy,
    serials: includeSerials
      ? lot.serials.map((serial) => serializeTimestampRecord(serial))
      : [],
  };
}

export type SerializedInventoryLot = ReturnType<typeof serializeLotForRole>;
