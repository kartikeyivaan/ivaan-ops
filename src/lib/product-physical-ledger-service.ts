import {
  InventoryTransactionType,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";

const PHYSICAL_TYPES: InventoryTransactionType[] = [
  InventoryTransactionType.INWARD,
  InventoryTransactionType.DISPATCH,
  InventoryTransactionType.DAMAGE,
  InventoryTransactionType.TRANSFER,
  InventoryTransactionType.ADJUST,
];

export type ProductPhysicalLedgerFilters = {
  productId: string;
  warehouseId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export type ProductPhysicalLedgerEntry = {
  id: string;
  occurredAt: string;
  transactionType: InventoryTransactionType;
  direction: "IN" | "OUT" | "NEUTRAL";
  qty: number;
  signedQty: number;
  runningBalance: number;
  fromWarehouse: { id: string; name: string } | null;
  toWarehouse: { id: string; name: string } | null;
  lot: { id: string; lotNumber: string } | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdBy: { id: string; name: string };
};

export type ProductPhysicalLedgerResult = {
  product: { id: string; displayName: string };
  warehouseId: string | null;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  entries: ProductPhysicalLedgerEntry[];
};

function parseDayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function parseDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

/**
 * Signed physical qty for a ledger row relative to a warehouse (or company warehouses).
 * BOOK is excluded from callers.
 */
export function signedPhysicalQty(
  tx: {
    transactionType: InventoryTransactionType;
    qty: number;
    fromWarehouseId: string | null;
    toWarehouseId: string | null;
    notes?: string | null;
  },
  scope?: { warehouseId?: string; companyWarehouseIds?: Set<string> },
): { direction: "IN" | "OUT" | "NEUTRAL"; signedQty: number } {
  const absQty = Math.abs(tx.qty);
  const warehouseId = scope?.warehouseId;

  if (warehouseId) {
    switch (tx.transactionType) {
      case InventoryTransactionType.INWARD:
        if (tx.toWarehouseId === warehouseId) {
          return { direction: "IN", signedQty: absQty };
        }
        return { direction: "NEUTRAL", signedQty: 0 };
      case InventoryTransactionType.DISPATCH:
      case InventoryTransactionType.DAMAGE:
        if (tx.fromWarehouseId === warehouseId) {
          return { direction: "OUT", signedQty: -absQty };
        }
        return { direction: "NEUTRAL", signedQty: 0 };
      case InventoryTransactionType.TRANSFER:
        if (tx.toWarehouseId === warehouseId) {
          return { direction: "IN", signedQty: absQty };
        }
        if (tx.fromWarehouseId === warehouseId) {
          return { direction: "OUT", signedQty: -absQty };
        }
        return { direction: "NEUTRAL", signedQty: 0 };
      case InventoryTransactionType.ADJUST:
        if (
          tx.fromWarehouseId === warehouseId &&
          tx.toWarehouseId === warehouseId
        ) {
          return { direction: "NEUTRAL", signedQty: 0 };
        }
        if (tx.toWarehouseId === warehouseId) {
          return { direction: "IN", signedQty: absQty };
        }
        if (tx.fromWarehouseId === warehouseId) {
          return { direction: "OUT", signedQty: -absQty };
        }
        return { direction: "NEUTRAL", signedQty: 0 };
      default:
        return { direction: "NEUTRAL", signedQty: 0 };
    }
  }

  const companyWh = scope?.companyWarehouseIds;
  const fromInCompany =
    !!tx.fromWarehouseId && !!companyWh?.has(tx.fromWarehouseId);
  const toInCompany =
    !!tx.toWarehouseId && !!companyWh?.has(tx.toWarehouseId);

  switch (tx.transactionType) {
    case InventoryTransactionType.INWARD:
      return { direction: "IN", signedQty: absQty };
    case InventoryTransactionType.DISPATCH:
    case InventoryTransactionType.DAMAGE:
      return { direction: "OUT", signedQty: -absQty };
    case InventoryTransactionType.TRANSFER: {
      const notes = (tx.notes ?? "").toLowerCase();
      if (notes.startsWith("received") || (toInCompany && !fromInCompany)) {
        return { direction: "IN", signedQty: absQty };
      }
      if (notes.startsWith("dispatched") || (fromInCompany && !toInCompany)) {
        return { direction: "OUT", signedQty: -absQty };
      }
      // Intra-company transfer: each txn still moves stock between warehouses;
      // without a warehouse filter, net company stock is unchanged.
      return { direction: "NEUTRAL", signedQty: 0 };
    }
    case InventoryTransactionType.ADJUST:
      if (tx.toWarehouseId && !tx.fromWarehouseId) {
        return { direction: "IN", signedQty: absQty };
      }
      if (tx.fromWarehouseId && !tx.toWarehouseId) {
        return { direction: "OUT", signedQty: -absQty };
      }
      if (tx.qty > 0) return { direction: "IN", signedQty: absQty };
      if (tx.qty < 0) return { direction: "OUT", signedQty: -absQty };
      return { direction: "NEUTRAL", signedQty: 0 };
    default:
      return { direction: "NEUTRAL", signedQty: 0 };
  }
}

/**
 * Product-wise physical ledger from inventory_transactions (oldest → newest)
 * with running balance for mismatch investigation.
 */
export async function listProductPhysicalLedger(
  prisma: PrismaClient,
  companyId: string,
  filters: ProductPhysicalLedgerFilters,
): Promise<ProductPhysicalLedgerResult | null> {
  const product = await prisma.product.findFirst({
    where: { id: filters.productId, isActive: true },
    select: { id: true, displayName: true },
  });
  if (!product) return null;

  const companyWarehouses = await prisma.warehouse.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
  });
  const companyWarehouseIds = new Set(companyWarehouses.map((w) => w.id));
  const warehouseIds = filters.warehouseId
    ? [filters.warehouseId]
    : [...companyWarehouseIds];

  const createdAtFilter =
    filters.fromDate || filters.toDate
      ? {
          ...(filters.fromDate ? { gte: parseDayStart(filters.fromDate) } : {}),
          ...(filters.toDate ? { lte: parseDayEnd(filters.toDate) } : {}),
        }
      : undefined;

  const rows = await prisma.inventoryTransaction.findMany({
    where: {
      companyId,
      productId: filters.productId,
      transactionType: { in: PHYSICAL_TYPES },
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(filters.warehouseId
        ? {
            OR: [
              { fromWarehouseId: filters.warehouseId },
              { toWarehouseId: filters.warehouseId },
            ],
          }
        : warehouseIds.length > 0
          ? {
              OR: [
                { fromWarehouseId: { in: warehouseIds } },
                { toWarehouseId: { in: warehouseIds } },
                {
                  AND: [
                    { fromWarehouseId: null },
                    { toWarehouseId: null },
                  ],
                },
              ],
            }
          : {}),
    },
    include: {
      lot: { select: { id: true, lotNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: filters.limit ?? 2000,
  });

  const warehouseIdSet = new Set(
    [
      ...rows.map((r) => r.fromWarehouseId),
      ...rows.map((r) => r.toWarehouseId),
    ].filter(Boolean) as string[],
  );

  const warehouses =
    warehouseIdSet.size > 0
      ? await prisma.warehouse.findMany({
          where: { id: { in: [...warehouseIdSet] } },
          select: { id: true, name: true },
        })
      : [];
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  let running = 0;
  let totalIn = 0;
  let totalOut = 0;

  const entries: ProductPhysicalLedgerEntry[] = rows.map((row) => {
    const qty = decimalToNumber(row.qty);
    const { direction, signedQty } = signedPhysicalQty(
      {
        transactionType: row.transactionType,
        qty,
        fromWarehouseId: row.fromWarehouseId,
        toWarehouseId: row.toWarehouseId,
        notes: row.notes,
      },
      {
        warehouseId: filters.warehouseId,
        companyWarehouseIds,
      },
    );
    running += signedQty;
    if (signedQty > 0) totalIn += signedQty;
    if (signedQty < 0) totalOut += Math.abs(signedQty);

    return {
      id: row.id,
      occurredAt: row.createdAt.toISOString(),
      transactionType: row.transactionType,
      direction,
      qty: Math.abs(qty),
      signedQty,
      runningBalance: running,
      fromWarehouse: row.fromWarehouseId
        ? warehouseById.get(row.fromWarehouseId) ?? null
        : null,
      toWarehouse: row.toWarehouseId
        ? warehouseById.get(row.toWarehouseId) ?? null
        : null,
      lot: row.lot,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      notes: row.notes,
      createdBy: row.createdBy,
    };
  });

  return {
    product,
    warehouseId: filters.warehouseId ?? null,
    totalIn,
    totalOut,
    closingBalance: running,
    entries,
  };
}
