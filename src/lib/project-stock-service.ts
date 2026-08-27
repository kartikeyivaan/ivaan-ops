import {
  Prisma,
  ProjectStatus,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { getPhysicalWarehouseStockForProduct } from "@/lib/inventory-stock";
import {
  createTransfer,
  deductNonSerialStock,
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

/** Open projects that still hold qty reservations. */
export const OPEN_PROJECT_RESERVATION_STATUSES: ProjectStatus[] = [
  ProjectStatus.OPEN,
  ProjectStatus.MATERIAL_DRAFT,
  ProjectStatus.MATERIAL_PENDING_APPROVAL,
  ProjectStatus.MATERIAL_ASSIGNED,
  ProjectStatus.READY_FOR_DISPATCH,
  ProjectStatus.PARTIALLY_DISPATCHED,
  ProjectStatus.FULLY_DISPATCHED,
];

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

/** Reduce stockSourceLog after reservation release (return / close). */
export function reduceStockSourceLog(
  existing: unknown,
  releaseQty: number,
): StockSourceLogEntry[] {
  const sources = parseStockSourceLog(existing);
  if (releaseQty <= 0 || sources.length === 0) return sources;

  const total = sources.reduce((sum, entry) => sum + entry.qty, 0);
  if (releaseQty >= total) return [];

  const reductions = computeProRataReturnAllocations(releaseQty, sources);
  const next = sources.map((entry) => ({ ...entry }));

  for (const reduction of reductions) {
    const entry = next.find(
      (row) =>
        row.companyId === reduction.companyId &&
        row.warehouseId === reduction.warehouseId,
    );
    if (entry) {
      entry.qty = Math.max(0, entry.qty - reduction.qty);
    }
  }

  return next.filter((entry) => entry.qty > 0);
}

export async function getProjectReservedQtyAtWarehouse(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  warehouseId: string,
  productId: string,
): Promise<number> {
  const lines = await prisma.projectMaterialLine.findMany({
    where: {
      productId,
      assignment: {
        project: { status: { in: OPEN_PROJECT_RESERVATION_STATUSES } },
      },
    },
    select: {
      assignedQty: true,
      dispatchedQty: true,
      stockSourceLog: true,
    },
  });

  let total = 0;
  for (const line of lines) {
    const balance = Math.max(
      0,
      decimalToNumber(line.assignedQty) - decimalToNumber(line.dispatchedQty),
    );
    if (balance <= 0) continue;

    const allocations = computeProRataReturnAllocations(
      balance,
      parseStockSourceLog(line.stockSourceLog),
    );
    for (const allocation of allocations) {
      if (
        allocation.companyId === companyId &&
        allocation.warehouseId === warehouseId
      ) {
        total += allocation.qty;
      }
    }
  }

  return total;
}

export async function getProjectCommittedQtyAtWarehouse(
  prisma: PrismaClient | Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
): Promise<number> {
  const lines = await prisma.projectMaterialLine.findMany({
    where: {
      productId,
      assignment: {
        project: {
          status: { in: OPEN_PROJECT_RESERVATION_STATUSES },
          warehouseId,
        },
      },
    },
    select: { assignedQty: true, dispatchedQty: true },
  });

  return lines.reduce(
    (sum, line) =>
      sum +
      Math.max(
        0,
        decimalToNumber(line.assignedQty) - decimalToNumber(line.dispatchedQty),
      ),
    0,
  );
}

export async function getPhysicalAvailableQtyAtWarehouse(
  prisma: PrismaClient,
  companyId: string,
  warehouseId: string,
  productId: string,
): Promise<number> {
  const summary = await getPhysicalWarehouseStockForProduct(
    prisma,
    companyId,
    productId,
    warehouseId,
  );
  return summary.availableStock;
}

/** B2B sales available = physical HO stock minus open project qty reservations. */
export async function getB2bAvailableQtyAtWarehouse(
  prisma: PrismaClient,
  companyId: string,
  warehouseId: string,
  productId: string,
): Promise<number> {
  const [physical, reserved] = await Promise.all([
    getPhysicalAvailableQtyAtWarehouse(prisma, companyId, warehouseId, productId),
    getProjectReservedQtyAtWarehouse(prisma, companyId, warehouseId, productId),
  ]);
  return Math.max(0, physical - reserved);
}

export type LineAllocationResult = {
  reservedQty: number;
  shortfallQty: number;
  sourceEntries: StockSourceLogEntry[];
};

/** Qty-only reservation at HO — no physical transfer or serial assignment. */
export async function allocateLineStock(
  prisma: PrismaClient,
  input: {
    iseCompanyId: string;
    iseHoWarehouseId: string;
    pcmCompanyId: string | null;
    pcmHoWarehouseId: string | null;
    productId: string;
    qtyNeeded: number;
  },
): Promise<LineAllocationResult> {
  let remaining = input.qtyNeeded;
  const sourceEntries: StockSourceLogEntry[] = [];

  if (remaining > 0) {
    const availIse = await getB2bAvailableQtyAtWarehouse(
      prisma,
      input.iseCompanyId,
      input.iseHoWarehouseId,
      input.productId,
    );
    const takeIse = Math.min(remaining, availIse);
    if (takeIse > 0) {
      sourceEntries.push({
        companyId: input.iseCompanyId,
        warehouseId: input.iseHoWarehouseId,
        qty: takeIse,
      });
      remaining -= takeIse;
    }
  }

  if (remaining > 0 && input.pcmCompanyId && input.pcmHoWarehouseId) {
    const availPcm = await getB2bAvailableQtyAtWarehouse(
      prisma,
      input.pcmCompanyId,
      input.pcmHoWarehouseId,
      input.productId,
    );
    const takePcm = Math.min(remaining, availPcm);
    if (takePcm > 0) {
      sourceEntries.push({
        companyId: input.pcmCompanyId,
        warehouseId: input.pcmHoWarehouseId,
        qty: takePcm,
      });
      remaining -= takePcm;
    }
  }

  const reservedQty = input.qtyNeeded - remaining;
  return {
    reservedQty,
    shortfallQty: remaining,
    sourceEntries,
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
  prisma: PrismaClient | Prisma.TransactionClient,
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

    const transfer = await createTransfer(prisma as PrismaClient, {
      fromCompanyId: batch.fromCompanyId,
      fromWarehouseId: batch.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      notes: input.referenceNote,
      lines: batch.lines,
      createdById: input.performedById,
    });

    await dispatchTransfer(prisma as PrismaClient, {
      transferId: transfer.id,
      companyId: batch.fromCompanyId,
      dispatchedById: input.performedById,
    });

    const refreshed = await prisma.inventoryTransfer.findUniqueOrThrow({
      where: { id: transfer.id },
      include: { lines: true },
    });

    await receiveTransfer(prisma as PrismaClient, {
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

export type HoWarehousePool = {
  companyId: string;
  warehouseId: string;
};

/** HO pools in priority order: ISE first, then PCM. */
export async function listHoWarehousePools(
  prisma: PrismaClient | Prisma.TransactionClient,
  projectCompanyId: string,
): Promise<HoWarehousePool[]> {
  const companies = await resolveStockCompanies(prisma as PrismaClient, projectCompanyId);
  const pools: HoWarehousePool[] = [
    { companyId: companies.iseCompanyId, warehouseId: companies.iseHoWarehouseId },
  ];
  if (companies.pcmCompanyId && companies.pcmHoWarehouseId) {
    pools.push({
      companyId: companies.pcmCompanyId,
      warehouseId: companies.pcmHoWarehouseId,
    });
  }
  return pools;
}

type DispatchStockPool = HoWarehousePool & { serialIds?: string[]; qty: number };

function groupSerialsForDispatch(
  serials: Array<{ id: string; productId: string; lot: { companyId: string }; currentWarehouseId: string | null }>,
): DispatchStockPool[] {
  const map = new Map<string, DispatchStockPool>();

  for (const serial of serials) {
    if (!serial.currentWarehouseId) continue;
    const key = `${serial.lot.companyId}:${serial.currentWarehouseId}`;
    const existing = map.get(key);
    if (existing) {
      existing.serialIds!.push(serial.id);
      existing.qty += 1;
    } else {
      map.set(key, {
        companyId: serial.lot.companyId,
        warehouseId: serial.currentWarehouseId,
        serialIds: [serial.id],
        qty: 1,
      });
    }
  }

  return [...map.values()];
}

/** Move dispatch stock HO → Projects WH, then out to site (serials → DISPATCHED). */
export async function executeProjectDispatchStockMove(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    projectCompanyId: string;
    projectsWarehouseId: string;
    productId: string;
    serialTracking: boolean;
    qty: number;
    serialIds?: string[];
    stockSourceLog: unknown;
    performedById: string;
    referenceNote: string;
  },
) {
  if (input.qty <= 0) return;

  const pools = await listHoWarehousePools(prisma, input.projectCompanyId);
  const batches: TransferBatch[] = [];

  if (input.serialTracking) {
    if (!input.serialIds?.length || input.serialIds.length !== input.qty) {
      throw new Error("SERIAL_REQUIRED");
    }

    const serials = await prisma.inventorySerial.findMany({
      where: { id: { in: input.serialIds } },
      select: {
        id: true,
        productId: true,
        currentWarehouseId: true,
        lot: { select: { companyId: true } },
      },
    });
    if (serials.length !== input.serialIds.length) {
      throw new Error("INVALID_SERIAL_SELECTION");
    }
    if (serials.some((serial) => serial.productId !== input.productId)) {
      throw new Error("INVALID_SERIAL_SELECTION");
    }

    const hoWarehouseIds = new Set(pools.map((pool) => pool.warehouseId));
    if (serials.some((serial) => !serial.currentWarehouseId || !hoWarehouseIds.has(serial.currentWarehouseId))) {
      throw new Error("INVALID_SERIAL_SELECTION");
    }

    for (const group of groupSerialsForDispatch(serials)) {
      batches.push({
        fromCompanyId: group.companyId,
        fromWarehouseId: group.warehouseId,
        lines: [
          {
            productId: input.productId,
            qty: group.qty,
            serialIds: group.serialIds,
          },
        ],
      });
    }
  } else {
    let remaining = input.qty;
    const preferredSources = parseStockSourceLog(input.stockSourceLog);
    const orderedPools: HoWarehousePool[] = [];

    for (const source of preferredSources) {
      if (!orderedPools.some((pool) => pool.warehouseId === source.warehouseId)) {
        orderedPools.push({
          companyId: source.companyId,
          warehouseId: source.warehouseId,
        });
      }
    }
    for (const pool of pools) {
      if (!orderedPools.some((row) => row.warehouseId === pool.warehouseId)) {
        orderedPools.push(pool);
      }
    }

    for (const pool of orderedPools) {
      if (remaining <= 0) break;
      const physical = await getPhysicalAvailableQtyAtWarehouse(
        prisma as PrismaClient,
        pool.companyId,
        pool.warehouseId,
        input.productId,
      );
      const take = Math.min(remaining, physical);
      if (take <= 0) continue;

      const existing = batches.find(
        (batch) =>
          batch.fromCompanyId === pool.companyId &&
          batch.fromWarehouseId === pool.warehouseId,
      );
      if (existing) {
        existing.lines.push({ productId: input.productId, qty: take });
      } else {
        batches.push({
          fromCompanyId: pool.companyId,
          fromWarehouseId: pool.warehouseId,
          lines: [{ productId: input.productId, qty: take }],
        });
      }
      remaining -= take;
    }

    if (remaining > 0) {
      throw new Error("INSUFFICIENT_STOCK");
    }
  }

  if (batches.length > 0) {
    await executeTransferBatches(prisma as PrismaClient, {
      batches,
      toCompanyId: input.projectCompanyId,
      toWarehouseId: input.projectsWarehouseId,
      performedById: input.performedById,
      referenceNote: input.referenceNote,
    });
  }

  if (input.serialTracking && input.serialIds?.length) {
    await prisma.inventorySerial.updateMany({
      where: { id: { in: input.serialIds } },
      data: { status: SerialStatus.DISPATCHED },
    });
  } else if (!input.serialTracking) {
    await deductNonSerialStock(prisma as PrismaClient, {
      companyId: input.projectCompanyId,
      warehouseId: input.projectsWarehouseId,
      productId: input.productId,
      qty: input.qty,
    });
  }
}

/** @deprecated Use qty-only reservation release via reduceStockSourceLog + assignedQty update. */
export async function returnMaterialLineStock(
  _prisma: PrismaClient | Prisma.TransactionClient,
  input: { returnQty: number },
): Promise<number> {
  return input.returnQty;
}

/** @deprecated PR fulfillment now reserves qty at HO without physical transfer. */
export async function transferReceivedStockToProjectWarehouse(
  _prisma: PrismaClient | Prisma.TransactionClient,
  _input: { qty: number },
) {
  return;
}
