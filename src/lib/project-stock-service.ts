import {
  Prisma,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import {
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
} from "@/lib/transfer-service";

export type StockSourceLogEntry = {
  companyId: string;
  warehouseId: string;
  qty: number;
};

type TransferLineBatch = {
  productId: string;
  qty: number;
  serialIds?: string[];
};

type TransferBatch = {
  fromCompanyId: string;
  fromWarehouseId: string;
  lines: TransferLineBatch[];
};

export type { TransferBatch };

export async function findCompanyByCode(
  prisma: PrismaClient | Prisma.TransactionClient,
  code: string,
) {
  return prisma.company.findFirst({
    where: { code, isActive: true },
    select: { id: true, code: true, name: true },
  });
}

export async function findHoWarehouse(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
) {
  return prisma.warehouse.findFirst({
    where: { companyId, code: "JAL-HO", isActive: true },
    select: { id: true, name: true, companyId: true },
  });
}

async function pickAvailableSerials(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    qty: number;
  },
): Promise<string[]> {
  if (input.qty <= 0) return [];

  const serials = await prisma.inventorySerial.findMany({
    where: {
      productId: input.productId,
      currentWarehouseId: input.warehouseId,
      status: SerialStatus.AVAILABLE,
      lot: { companyId: input.companyId },
    },
    orderBy: { createdAt: "asc" },
    take: input.qty,
    select: { id: true },
  });

  return serials.map((row) => row.id);
}

export async function getAvailableQtyAtWarehouse(
  prisma: PrismaClient,
  companyId: string,
  warehouseId: string,
  productId: string,
): Promise<number> {
  const summary = await getWarehouseStockForProduct(
    prisma,
    companyId,
    productId,
    warehouseId,
  );
  return summary.availableStock;
}

export type LineAllocationResult = {
  transferredQty: number;
  shortfallQty: number;
  sourceEntries: StockSourceLogEntry[];
  transferBatches: TransferBatch[];
};

export async function allocateLineStock(
  prisma: PrismaClient,
  input: {
    iseCompanyId: string;
    iseHoWarehouseId: string;
    pcmCompanyId: string | null;
    pcmHoWarehouseId: string | null;
    productId: string;
    serialTracking: boolean;
    qtyNeeded: number;
  },
): Promise<LineAllocationResult> {
  let remaining = input.qtyNeeded;
  const sourceEntries: StockSourceLogEntry[] = [];
  const batchMap = new Map<string, TransferBatch>();

  const addToBatch = (
    fromCompanyId: string,
    fromWarehouseId: string,
    line: TransferLineBatch,
  ) => {
    const key = `${fromCompanyId}:${fromWarehouseId}`;
    const existing = batchMap.get(key);
    if (existing) {
      existing.lines.push(line);
    } else {
      batchMap.set(key, {
        fromCompanyId,
        fromWarehouseId,
        lines: [line],
      });
    }
  };

  if (remaining > 0) {
    const availIse = await getAvailableQtyAtWarehouse(
      prisma,
      input.iseCompanyId,
      input.iseHoWarehouseId,
      input.productId,
    );
    const takeIse = Math.min(remaining, availIse);
    if (takeIse > 0) {
      if (input.serialTracking) {
        const serialIds = await pickAvailableSerials(prisma, {
          companyId: input.iseCompanyId,
          warehouseId: input.iseHoWarehouseId,
          productId: input.productId,
          qty: takeIse,
        });
        if (serialIds.length > 0) {
          const serialQty = serialIds.length;
          sourceEntries.push({
            companyId: input.iseCompanyId,
            warehouseId: input.iseHoWarehouseId,
            qty: serialQty,
          });
          addToBatch(input.iseCompanyId, input.iseHoWarehouseId, {
            productId: input.productId,
            qty: serialQty,
            serialIds,
          });
          remaining -= serialQty;
        }
      } else {
        sourceEntries.push({
          companyId: input.iseCompanyId,
          warehouseId: input.iseHoWarehouseId,
          qty: takeIse,
        });
        addToBatch(input.iseCompanyId, input.iseHoWarehouseId, {
          productId: input.productId,
          qty: takeIse,
        });
        remaining -= takeIse;
      }
    }
  }

  if (remaining > 0 && input.pcmCompanyId && input.pcmHoWarehouseId) {
    const availPcm = await getAvailableQtyAtWarehouse(
      prisma,
      input.pcmCompanyId,
      input.pcmHoWarehouseId,
      input.productId,
    );
    const takePcm = Math.min(remaining, availPcm);
    if (takePcm > 0) {
      if (input.serialTracking) {
        const serialIds = await pickAvailableSerials(prisma, {
          companyId: input.pcmCompanyId,
          warehouseId: input.pcmHoWarehouseId,
          productId: input.productId,
          qty: takePcm,
        });
        if (serialIds.length > 0) {
          const serialQty = serialIds.length;
          sourceEntries.push({
            companyId: input.pcmCompanyId,
            warehouseId: input.pcmHoWarehouseId,
            qty: serialQty,
          });
          addToBatch(input.pcmCompanyId, input.pcmHoWarehouseId, {
            productId: input.productId,
            qty: serialQty,
            serialIds,
          });
          remaining -= serialQty;
        }
      } else {
        sourceEntries.push({
          companyId: input.pcmCompanyId,
          warehouseId: input.pcmHoWarehouseId,
          qty: takePcm,
        });
        addToBatch(input.pcmCompanyId, input.pcmHoWarehouseId, {
          productId: input.productId,
          qty: takePcm,
        });
        remaining -= takePcm;
      }
    }
  }

  const transferredQty = input.qtyNeeded - remaining;
  return {
    transferredQty,
    shortfallQty: remaining,
    sourceEntries,
    transferBatches: [...batchMap.values()],
  };
}

export function mergeStockSourceLog(
  existing: unknown,
  additions: StockSourceLogEntry[],
): StockSourceLogEntry[] {
  const prior = Array.isArray(existing)
    ? (existing as StockSourceLogEntry[])
    : [];
  return [...prior, ...additions];
}

export async function executeTransferBatches(
  prisma: PrismaClient,
  input: {
    batches: TransferBatch[];
    toCompanyId: string;
    toWarehouseId: string;
    performedById: string;
    referenceNote: string;
  },
) {
  for (const batch of input.batches) {
    if (batch.lines.length === 0) continue;

    const transfer = await createTransfer(prisma, {
      fromCompanyId: batch.fromCompanyId,
      fromWarehouseId: batch.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      notes: input.referenceNote,
      lines: batch.lines,
      createdById: input.performedById,
    });

    await dispatchTransfer(prisma, {
      transferId: transfer.id,
      companyId: batch.fromCompanyId,
      dispatchedById: input.performedById,
    });

    const refreshed = await prisma.inventoryTransfer.findUniqueOrThrow({
      where: { id: transfer.id },
      include: { lines: true },
    });

    await receiveTransfer(prisma, {
      transferId: transfer.id,
      companyId: input.toCompanyId,
      receivedById: input.performedById,
      lines: refreshed.lines.map((line) => ({
        lineId: line.id,
        receivedQty: decimalToNumber(line.qty),
      })),
    });
  }
}

export async function resolveStockCompanies(prisma: PrismaClient, projectCompanyId: string) {
  const iseCompany = await findCompanyByCode(prisma, "ISE");
  if (!iseCompany) throw new Error("ISE_COMPANY_NOT_FOUND");

  const iseHo = await findHoWarehouse(prisma, iseCompany.id);
  if (!iseHo) throw new Error("ISE_HO_NOT_FOUND");

  const pcmCompany = await findCompanyByCode(prisma, "PCMV");
  const pcmHo = pcmCompany ? await findHoWarehouse(prisma, pcmCompany.id) : null;

  if (projectCompanyId !== iseCompany.id) {
    throw new Error("PROJECT_COMPANY_MISMATCH");
  }

  return {
    iseCompanyId: iseCompany.id,
    iseHoWarehouseId: iseHo.id,
    pcmCompanyId: pcmCompany?.id ?? null,
    pcmHoWarehouseId: pcmHo?.id ?? null,
  };
}

export function mergeTransferBatches(batches: TransferBatch[]): TransferBatch[] {
  const map = new Map<string, TransferBatch>();

  for (const batch of batches) {
    const key = `${batch.fromCompanyId}:${batch.fromWarehouseId}`;
    const existing = map.get(key);
    if (existing) {
      existing.lines.push(...batch.lines);
    } else {
      map.set(key, {
        fromCompanyId: batch.fromCompanyId,
        fromWarehouseId: batch.fromWarehouseId,
        lines: [...batch.lines],
      });
    }
  }

  return [...map.values()];
}

export function parseStockSourceLog(raw: unknown): StockSourceLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is StockSourceLogEntry =>
        typeof entry === "object" &&
        entry != null &&
        typeof (entry as StockSourceLogEntry).companyId === "string" &&
        typeof (entry as StockSourceLogEntry).warehouseId === "string" &&
        typeof (entry as StockSourceLogEntry).qty === "number",
    )
    .map((entry) => ({
      companyId: entry.companyId,
      warehouseId: entry.warehouseId,
      qty: entry.qty,
    }));
}

/** Split return qty across original source warehouses proportionally. */
export function computeProRataReturnAllocations(
  returnQty: number,
  sources: StockSourceLogEntry[],
  fallback?: StockSourceLogEntry,
): StockSourceLogEntry[] {
  if (returnQty <= 0) return [];

  const totalSourced = sources.reduce((sum, entry) => sum + entry.qty, 0);
  const effectiveSources =
    totalSourced > 0 ? sources : fallback ? [fallback] : [];

  if (effectiveSources.length === 0) return [];

  const total = effectiveSources.reduce((sum, entry) => sum + entry.qty, 0);
  let remaining = returnQty;
  const allocations: StockSourceLogEntry[] = [];

  for (let index = 0; index < effectiveSources.length; index++) {
    const source = effectiveSources[index]!;
    const isLast = index === effectiveSources.length - 1;
    let qty = isLast
      ? remaining
      : Math.round((returnQty * source.qty) / total * 1000) / 1000;
    qty = Math.min(qty, remaining, source.qty);
    if (qty > 0) {
      allocations.push({
        companyId: source.companyId,
        warehouseId: source.warehouseId,
        qty,
      });
      remaining -= qty;
    }
  }

  return allocations;
}

export async function executeReturnTransferBatches(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    fromCompanyId: string;
    fromWarehouseId: string;
    productId: string;
    serialTracking: boolean;
    allocations: StockSourceLogEntry[];
    performedById: string;
    referenceNote: string;
  },
) {
  for (const allocation of input.allocations) {
    if (allocation.qty <= 0) continue;

    let serialIds: string[] | undefined;
    if (input.serialTracking) {
      serialIds = await pickAvailableSerials(prisma as PrismaClient, {
        companyId: input.fromCompanyId,
        warehouseId: input.fromWarehouseId,
        productId: input.productId,
        qty: allocation.qty,
      });
      if (serialIds.length < allocation.qty) {
        throw new Error("INSUFFICIENT_STOCK");
      }
    }

    const transfer = await createTransfer(prisma as PrismaClient, {
      fromCompanyId: input.fromCompanyId,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: allocation.warehouseId,
      notes: input.referenceNote,
      lines: [
        {
          productId: input.productId,
          qty: allocation.qty,
          serialIds,
        },
      ],
      createdById: input.performedById,
    });

    await dispatchTransfer(prisma as PrismaClient, {
      transferId: transfer.id,
      companyId: input.fromCompanyId,
      dispatchedById: input.performedById,
    });

    const destination = await prisma.warehouse.findUniqueOrThrow({
      where: { id: allocation.warehouseId },
      select: { companyId: true },
    });

    const refreshed = await prisma.inventoryTransfer.findUniqueOrThrow({
      where: { id: transfer.id },
      include: { lines: true },
    });

    await receiveTransfer(prisma as PrismaClient, {
      transferId: transfer.id,
      companyId: destination.companyId,
      receivedById: input.performedById,
      lines: refreshed.lines.map((line) => ({
        lineId: line.id,
        receivedQty: decimalToNumber(line.qty),
      })),
    });
  }
}

export async function returnMaterialLineStock(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    projectCompanyId: string;
    projectWarehouseId: string;
    productId: string;
    serialTracking: boolean;
    stockSourceLog: unknown;
    returnQty: number;
    performedById: string;
    referenceNote: string;
    fallbackHo?: StockSourceLogEntry;
  },
): Promise<number> {
  if (input.returnQty <= 0) return 0;

  const sources = parseStockSourceLog(input.stockSourceLog);
  const allocations = computeProRataReturnAllocations(
    input.returnQty,
    sources,
    input.fallbackHo,
  );
  if (allocations.length === 0) {
    throw new Error("RETURN_SOURCE_UNKNOWN");
  }

  await executeReturnTransferBatches(prisma, {
    fromCompanyId: input.projectCompanyId,
    fromWarehouseId: input.projectWarehouseId,
    productId: input.productId,
    serialTracking: input.serialTracking,
    allocations,
    performedById: input.performedById,
    referenceNote: input.referenceNote,
  });

  return allocations.reduce((sum, row) => sum + row.qty, 0);
}

export async function transferReceivedStockToProjectWarehouse(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    fromCompanyId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    productId: string;
    serialTracking: boolean;
    qty: number;
    performedById: string;
    referenceNote: string;
  },
) {
  if (input.qty <= 0) return;

  let serialIds: string[] | undefined;
  if (input.serialTracking) {
    serialIds = await pickAvailableSerials(prisma as PrismaClient, {
      companyId: input.fromCompanyId,
      warehouseId: input.fromWarehouseId,
      productId: input.productId,
      qty: input.qty,
    });
    if (serialIds.length < input.qty) {
      throw new Error("INSUFFICIENT_STOCK");
    }
  }

  await executeTransferBatches(prisma as PrismaClient, {
    batches: [
      {
        fromCompanyId: input.fromCompanyId,
        fromWarehouseId: input.fromWarehouseId,
        lines: [
          {
            productId: input.productId,
            qty: input.qty,
            serialIds,
          },
        ],
      },
    ],
    toCompanyId: input.fromCompanyId,
    toWarehouseId: input.toWarehouseId,
    performedById: input.performedById,
    referenceNote: input.referenceNote,
  });
}
