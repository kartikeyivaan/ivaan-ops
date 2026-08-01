import {
  DailyAuditStatus,
  InventoryEventStatus,
  InventoryEventType,
  InventoryOpeningPhase,
  InventoryTransactionType,
  LotStatus,
  OpeningAuditStatus,
  OpeningLineCondition,
  Prisma,
  SerialStatus,
  TransferStatus,
  type PrismaClient,
} from "@prisma/client";

import { writeAuditLogTx } from "@/lib/audit";
import { createEvent } from "@/lib/inventory-event-service";
import {
  generateLotNumber,
  getFinancialYear,
  normalizeSerialNumber,
  systemPurchaseInvoiceNo,
} from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import { PRODUCT_CATEGORY_NAMES, resolveSerialTracking } from "@/lib/products";

export const OPENING_AUDIT_SOURCE = "OPENING_STOCK_AUDIT";

const openingAuditInclude = {
  warehouse: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
          capacityUnit: true,
          category: { select: { id: true, name: true } },
        },
      },
      serials: { orderBy: { createdAt: "asc" as const } },
    },
    orderBy: [{ condition: "asc" as const }, { createdAt: "asc" as const }],
  },
} satisfies Prisma.InventoryOpeningAuditInclude;

const dailyAuditInclude = {
  warehouse: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.InventoryDailyAuditInclude;

function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value);
}

async function generateOpeningAuditNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const prefix = `OSA-${fy}-`;
  const latest = await prisma.inventoryOpeningAudit.findFirst({
    where: { auditNumber: { startsWith: prefix } },
    orderBy: { auditNumber: "desc" },
    select: { auditNumber: true },
  });
  const next = latest
    ? Number(latest.auditNumber.slice(prefix.length)) + 1
    : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function generateDailyAuditNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const prefix = `IDA-${fy}-`;
  const latest = await prisma.inventoryDailyAudit.findFirst({
    where: { auditNumber: { startsWith: prefix } },
    orderBy: { auditNumber: "desc" },
    select: { auditNumber: true },
  });
  const next = latest
    ? Number(latest.auditNumber.slice(prefix.length)) + 1
    : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function getCompanyOpeningPhase(
  prisma: PrismaClient,
  companyId: string,
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      inventoryOpeningPhase: true,
      inventoryTrackingStartDate: true,
    },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  return company;
}

/** Throws INVENTORY_OPS_BLOCKED when Opening Stock is in progress. */
export async function assertInventoryOpsAllowed(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { inventoryOpeningPhase: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  if (company.inventoryOpeningPhase === InventoryOpeningPhase.IN_PROGRESS) {
    throw new Error("INVENTORY_OPS_BLOCKED");
  }
}

export async function wipeCompanyPhysicalStock(
  tx: Prisma.TransactionClient,
  companyId: string,
  performedById: string,
) {
  const openTransfers = await tx.inventoryTransfer.count({
    where: {
      OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }],
      status: { in: [TransferStatus.DRAFT, TransferStatus.DISPATCHED] },
    },
  });
  if (openTransfers > 0) {
    throw new Error("OPEN_TRANSFERS_EXIST");
  }

  const lots = await tx.inventoryLot.findMany({
    where: { companyId },
    select: { id: true },
  });
  const lotIds = lots.map((lot) => lot.id);

  if (lotIds.length > 0) {
    const serials = await tx.inventorySerial.findMany({
      where: { lotId: { in: lotIds } },
      select: { id: true },
    });
    const serialIds = serials.map((serial) => serial.id);

    if (serialIds.length > 0) {
      await tx.proformaInvoiceSerial.deleteMany({
        where: { serialId: { in: serialIds } },
      });
      await tx.dispatchLineSerial.deleteMany({
        where: { serialId: { in: serialIds } },
      });
      await tx.inventoryTransferLineSerial.deleteMany({
        where: { serialId: { in: serialIds } },
      });
      await tx.inventorySerial.deleteMany({
        where: { id: { in: serialIds } },
      });
    }

    await tx.inventoryLot.deleteMany({ where: { companyId } });
  }

  await tx.inventoryEvent.updateMany({
    where: {
      companyId,
      status: { not: InventoryEventStatus.CANCELLED },
    },
    data: {
      status: InventoryEventStatus.CANCELLED,
      cancellationReason: "Opening stock reset",
      cancelledAt: new Date(),
      updatedById: performedById,
    },
  });
}

/**
 * Super Admin: wipe physical stock, set opening phase IN_PROGRESS,
 * ensure a DRAFT opening audit exists per active warehouse.
 */
export async function startOpeningStockPreparation(
  prisma: PrismaClient,
  input: { companyId: string; performedById: string },
) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { inventoryOpeningPhase: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  if (company.inventoryOpeningPhase === InventoryOpeningPhase.COMPLETED) {
    throw new Error("OPENING_ALREADY_COMPLETED");
  }

  if (company.inventoryOpeningPhase === InventoryOpeningPhase.IN_PROGRESS) {
    const approved = await prisma.inventoryOpeningAudit.count({
      where: {
        companyId: input.companyId,
        status: OpeningAuditStatus.APPROVED,
      },
    });
    if (approved > 0) {
      throw new Error("APPROVED_AUDITS_EXIST");
    }
  }

  return prisma.$transaction(async (tx) => {
    await wipeCompanyPhysicalStock(tx, input.companyId, input.performedById);

    await tx.inventoryOpeningAudit.deleteMany({
      where: {
        companyId: input.companyId,
        status: { not: OpeningAuditStatus.APPROVED },
      },
    });

    await tx.company.update({
      where: { id: input.companyId },
      data: {
        inventoryOpeningPhase: InventoryOpeningPhase.IN_PROGRESS,
        inventoryTrackingStartDate: null,
      },
    });

    const warehouses = await tx.warehouse.findMany({
      where: { companyId: input.companyId, isActive: true },
      orderBy: { name: "asc" },
    });

    const audits = [];
    for (const warehouse of warehouses) {
      const existing = await tx.inventoryOpeningAudit.findUnique({
        where: {
          companyId_warehouseId: {
            companyId: input.companyId,
            warehouseId: warehouse.id,
          },
        },
      });
      if (existing) {
        audits.push(existing);
        continue;
      }
      const auditNumber = await generateOpeningAuditNumber(tx);
      const created = await tx.inventoryOpeningAudit.create({
        data: {
          auditNumber,
          companyId: input.companyId,
          warehouseId: warehouse.id,
          status: OpeningAuditStatus.DRAFT,
          createdById: input.performedById,
        },
        include: openingAuditInclude,
      });
      audits.push(created);
    }

    await writeAuditLogTx(tx, {
      tableName: "companies",
      recordId: input.companyId,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: {
        inventoryOpeningPhase: InventoryOpeningPhase.IN_PROGRESS,
        action: "OPENING_STOCK_RESET",
        warehousesPrepared: warehouses.length,
      },
    });

    return {
      phase: InventoryOpeningPhase.IN_PROGRESS,
      audits,
      warehouseCount: warehouses.length,
    };
  });
}

export async function listOpeningAudits(
  prisma: PrismaClient,
  companyId: string,
) {
  return prisma.inventoryOpeningAudit.findMany({
    where: { companyId },
    include: {
      warehouse: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getOpeningAudit(
  prisma: PrismaClient,
  companyId: string,
  auditId: string,
) {
  const audit = await prisma.inventoryOpeningAudit.findFirst({
    where: { id: auditId, companyId },
    include: openingAuditInclude,
  });
  if (!audit) throw new Error("NOT_FOUND");
  return audit;
}

export async function createOpeningAudit(
  prisma: PrismaClient,
  input: { companyId: string; warehouseId: string; createdById: string },
) {
  const phase = await getCompanyOpeningPhase(prisma, input.companyId);
  if (phase.inventoryOpeningPhase !== InventoryOpeningPhase.IN_PROGRESS) {
    throw new Error("OPENING_NOT_IN_PROGRESS");
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: {
      id: input.warehouseId,
      companyId: input.companyId,
      isActive: true,
    },
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

  const existing = await prisma.inventoryOpeningAudit.findUnique({
    where: {
      companyId_warehouseId: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
      },
    },
  });
  if (existing) throw new Error("AUDIT_EXISTS");

  const auditNumber = await generateOpeningAuditNumber(prisma);
  return prisma.inventoryOpeningAudit.create({
    data: {
      auditNumber,
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      status: OpeningAuditStatus.DRAFT,
      createdById: input.createdById,
    },
    include: openingAuditInclude,
  });
}

export async function upsertOpeningLine(
  prisma: PrismaClient,
  input: {
    companyId: string;
    auditId: string;
    productId: string;
    condition: OpeningLineCondition;
    physicalQty?: number;
    serialNumbers?: string[];
    remarks?: string | null;
  },
) {
  const audit = await prisma.inventoryOpeningAudit.findFirst({
    where: { id: input.auditId, companyId: input.companyId },
  });
  if (!audit) throw new Error("NOT_FOUND");
  if (audit.status !== OpeningAuditStatus.DRAFT) {
    throw new Error("AUDIT_LOCKED");
  }

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { category: { select: { name: true } } },
  });
  if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");

  if (input.condition === OpeningLineCondition.DAMAGED) {
    if (
      !resolveSerialTracking(product.category.name) ||
      !product.serialTracking
    ) {
      throw new Error("DAMAGED_SERIAL_PRODUCTS_ONLY");
    }
  }

  const normalizedSerials = product.serialTracking
    ? [...new Set((input.serialNumbers ?? []).map(normalizeSerialNumber))]
    : [];

  if (product.serialTracking) {
    if (normalizedSerials.length === 0 && (input.physicalQty ?? 0) > 0) {
      throw new Error("SERIAL_REQUIRED");
    }
    // Cross-line uniqueness within this audit
    const otherSerials = await prisma.inventoryOpeningAuditSerial.findMany({
      where: {
        serialNumber: { in: normalizedSerials },
        line: { auditId: audit.id },
      },
      include: {
        line: { select: { id: true, productId: true, condition: true } },
      },
    });
    const conflicts = otherSerials.filter(
      (row) =>
        !(
          row.line.productId === input.productId &&
          row.line.condition === input.condition
        ),
    );
    if (conflicts.length > 0) {
      throw new Error("DUPLICATE_SERIAL_IN_AUDIT");
    }

    // Also block if already exists in inventory (should be empty after reset)
    const existingInventory = await prisma.inventorySerial.findMany({
      where: { serialNumber: { in: normalizedSerials } },
      select: { serialNumber: true },
    });
    if (existingInventory.length > 0) {
      throw new Error("DUPLICATE_SERIAL");
    }
  }

  const physicalQty = product.serialTracking
    ? normalizedSerials.length
    : (input.physicalQty ?? 0);

  if (!product.serialTracking && physicalQty < 0) {
    throw new Error("INVALID_QUANTITY");
  }

  return prisma.$transaction(async (tx) => {
    const line = await tx.inventoryOpeningAuditLine.upsert({
      where: {
        auditId_productId_condition: {
          auditId: audit.id,
          productId: input.productId,
          condition: input.condition,
        },
      },
      create: {
        auditId: audit.id,
        productId: input.productId,
        condition: input.condition,
        physicalQty,
        remarks: input.remarks ?? null,
      },
      update: {
        physicalQty,
        remarks: input.remarks ?? null,
      },
    });

    if (product.serialTracking) {
      await tx.inventoryOpeningAuditSerial.deleteMany({
        where: { lineId: line.id },
      });
      if (normalizedSerials.length > 0) {
        await tx.inventoryOpeningAuditSerial.createMany({
          data: normalizedSerials.map((serialNumber) => ({
            lineId: line.id,
            serialNumber,
          })),
        });
      }
    }

    return tx.inventoryOpeningAuditLine.findUniqueOrThrow({
      where: { id: line.id },
      include: {
        product: {
          select: {
            id: true,
            displayName: true,
            serialTracking: true,
            capacityUnit: true,
            category: { select: { id: true, name: true } },
          },
        },
        serials: { orderBy: { createdAt: "asc" } },
      },
    });
  });
}

export async function deleteOpeningLine(
  prisma: PrismaClient,
  input: { companyId: string; auditId: string; lineId: string },
) {
  const audit = await prisma.inventoryOpeningAudit.findFirst({
    where: { id: input.auditId, companyId: input.companyId },
  });
  if (!audit) throw new Error("NOT_FOUND");
  if (audit.status !== OpeningAuditStatus.DRAFT) {
    throw new Error("AUDIT_LOCKED");
  }

  const line = await prisma.inventoryOpeningAuditLine.findFirst({
    where: { id: input.lineId, auditId: audit.id },
  });
  if (!line) throw new Error("LINE_NOT_FOUND");

  await prisma.inventoryOpeningAuditLine.delete({ where: { id: line.id } });
  return { deleted: true };
}

export async function submitOpeningAudit(
  prisma: PrismaClient,
  input: { companyId: string; auditId: string; submittedById: string },
) {
  const audit = await getOpeningAudit(prisma, input.companyId, input.auditId);
  if (audit.status !== OpeningAuditStatus.DRAFT) {
    throw new Error("AUDIT_LOCKED");
  }

  for (const line of audit.lines) {
    if (line.product.serialTracking) {
      const qty = decimalToNumber(line.physicalQty);
      if (qty !== line.serials.length) {
        throw new Error("SERIAL_COUNT_MISMATCH");
      }
    }
  }

  return prisma.inventoryOpeningAudit.update({
    where: { id: audit.id },
    data: {
      status: OpeningAuditStatus.SUBMITTED,
      submittedAt: new Date(),
      submittedById: input.submittedById,
    },
    include: openingAuditInclude,
  });
}

export async function approveOpeningAudit(
  prisma: PrismaClient,
  input: { companyId: string; auditId: string; approvedById: string },
) {
  const phase = await getCompanyOpeningPhase(prisma, input.companyId);
  if (phase.inventoryOpeningPhase !== InventoryOpeningPhase.IN_PROGRESS) {
    throw new Error("OPENING_NOT_IN_PROGRESS");
  }

  const audit = await getOpeningAudit(prisma, input.companyId, input.auditId);
  if (audit.status !== OpeningAuditStatus.SUBMITTED) {
    throw new Error("AUDIT_NOT_SUBMITTED");
  }

  // Validate serial uniqueness across all submitted/approved audits for company
  const allSerials = audit.lines.flatMap((line) =>
    line.serials.map((s) => s.serialNumber),
  );
  if (allSerials.length > 0) {
    const existing = await prisma.inventorySerial.findMany({
      where: { serialNumber: { in: allSerials } },
      select: { serialNumber: true },
    });
    if (existing.length > 0) throw new Error("DUPLICATE_SERIAL");
  }

  return prisma.$transaction(async (tx) => {
    const effectiveDate = new Date();
    effectiveDate.setUTCHours(0, 0, 0, 0);

    for (const line of audit.lines) {
      const qty = decimalToNumber(line.physicalQty);
      if (qty <= 0 && line.serials.length === 0) continue;

      const lotNumber = await generateLotNumber(tx, effectiveDate);
      const isDamaged = line.condition === OpeningLineCondition.DAMAGED;
      const goodQty = isDamaged ? 0 : qty;
      const damagedQty = isDamaged ? qty : 0;

      const lot = await tx.inventoryLot.create({
        data: {
          lotNumber,
          companyId: input.companyId,
          warehouseId: audit.warehouseId,
          purchaseInvoiceNo: systemPurchaseInvoiceNo(`${lotNumber}-OSA`),
          purchaseDate: effectiveDate,
          productId: line.productId,
          quantity: qty,
          receivedQuantity: goodQty,
          damagedQuantity: damagedQty,
          status: LotStatus.CLOSED,
          remarks: `Opening stock audit ${audit.auditNumber}`,
          referenceNumber: audit.auditNumber,
          createdById: input.approvedById,
        },
      });

      if (line.product.serialTracking && line.serials.length > 0) {
        await tx.inventorySerial.createMany({
          data: line.serials.map((serial) => ({
            lotId: lot.id,
            productId: line.productId,
            serialNumber: serial.serialNumber,
            status: isDamaged ? SerialStatus.DAMAGED : SerialStatus.AVAILABLE,
            currentWarehouseId: audit.warehouseId,
          })),
        });
      }

      if (goodQty > 0) {
        await tx.inventoryTransaction.create({
          data: {
            transactionType: InventoryTransactionType.INWARD,
            companyId: input.companyId,
            productId: line.productId,
            lotId: lot.id,
            qty: goodQty,
            toWarehouseId: audit.warehouseId,
            referenceType: "OPENING_AUDIT",
            referenceId: audit.id,
            notes: `Opening stock ${audit.auditNumber}`,
            createdById: input.approvedById,
          },
        });

        await createEvent(tx, {
          companyId: input.companyId,
          warehouseId: audit.warehouseId,
          productId: line.productId,
          eventType: InventoryEventType.OPENING_STOCK,
          quantity: goodQty,
          effectiveDate,
          sourceType: OPENING_AUDIT_SOURCE,
          sourceId: audit.id,
          sourceNumber: audit.auditNumber,
          notes: `Opening stock audit ${audit.auditNumber}`,
          createdById: input.approvedById,
        });
      }

      if (damagedQty > 0) {
        await tx.inventoryTransaction.create({
          data: {
            transactionType: InventoryTransactionType.DAMAGE,
            companyId: input.companyId,
            productId: line.productId,
            lotId: lot.id,
            qty: damagedQty,
            fromWarehouseId: audit.warehouseId,
            referenceType: "OPENING_AUDIT",
            referenceId: audit.id,
            notes: `Opening damaged stock ${audit.auditNumber}`,
            createdById: input.approvedById,
          },
        });
      }
    }

    const updated = await tx.inventoryOpeningAudit.update({
      where: { id: audit.id },
      data: {
        status: OpeningAuditStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: input.approvedById,
      },
      include: openingAuditInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_opening_audits",
      recordId: audit.id,
      action: "APPROVE",
      performedBy: input.approvedById,
      companyId: input.companyId,
      newValue: { status: OpeningAuditStatus.APPROVED },
    });

    const warehouses = await tx.warehouse.findMany({
      where: { companyId: input.companyId, isActive: true },
      select: { id: true },
    });
    const approvedCount = await tx.inventoryOpeningAudit.count({
      where: {
        companyId: input.companyId,
        status: OpeningAuditStatus.APPROVED,
        warehouseId: { in: warehouses.map((w) => w.id) },
      },
    });

    if (warehouses.length > 0 && approvedCount >= warehouses.length) {
      await tx.company.update({
        where: { id: input.companyId },
        data: {
          inventoryOpeningPhase: InventoryOpeningPhase.COMPLETED,
          inventoryTrackingStartDate: new Date(),
        },
      });
    }

    return updated;
  });
}

export async function rejectOpeningAudit(
  prisma: PrismaClient,
  input: {
    companyId: string;
    auditId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const audit = await getOpeningAudit(prisma, input.companyId, input.auditId);
  if (audit.status !== OpeningAuditStatus.SUBMITTED) {
    throw new Error("AUDIT_NOT_SUBMITTED");
  }

  const rejectionNote = `Rejected: ${input.reason}`;
  const notes = audit.notes ? `${audit.notes}\n${rejectionNote}` : rejectionNote;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryOpeningAudit.update({
      where: { id: audit.id },
      data: {
        status: OpeningAuditStatus.DRAFT,
        submittedAt: null,
        submittedById: null,
        notes,
      },
      include: openingAuditInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_opening_audits",
      recordId: audit.id,
      action: "UPDATE",
      performedBy: input.rejectedById,
      companyId: input.companyId,
      oldValue: { status: OpeningAuditStatus.SUBMITTED },
      newValue: {
        status: OpeningAuditStatus.DRAFT,
        decision: "REJECTED",
        reason: input.reason,
      },
      reference: audit.auditNumber,
    });

    return updated;
  });
}

export async function listDailyAudits(
  prisma: PrismaClient,
  companyId: string,
) {
  return prisma.inventoryDailyAudit.findMany({
    where: { companyId },
    include: {
      warehouse: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: [{ auditDate: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}

export async function getDailyAudit(
  prisma: PrismaClient,
  companyId: string,
  auditId: string,
) {
  const audit = await prisma.inventoryDailyAudit.findFirst({
    where: { id: auditId, companyId },
    include: dailyAuditInclude,
  });
  if (!audit) throw new Error("NOT_FOUND");
  return audit;
}

export async function createDailyAudit(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    createdById: string;
    auditDate?: Date;
  },
) {
  const phase = await getCompanyOpeningPhase(prisma, input.companyId);
  if (phase.inventoryOpeningPhase !== InventoryOpeningPhase.COMPLETED) {
    throw new Error("INVENTORY_NOT_LIVE");
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: {
      id: input.warehouseId,
      companyId: input.companyId,
      isActive: true,
    },
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

  const auditDate = input.auditDate ?? new Date();
  auditDate.setUTCHours(0, 0, 0, 0);

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      category: {
        name: {
          in: [PRODUCT_CATEGORY_NAMES[0], PRODUCT_CATEGORY_NAMES[1]],
        },
      },
    },
    select: { id: true },
    orderBy: { displayName: "asc" },
  });

  const systemQtys = new Map<string, number>();
  for (const product of products) {
    const stock = await getWarehouseStockForProduct(
      prisma,
      input.companyId,
      product.id,
      input.warehouseId,
    );
    systemQtys.set(product.id, stock.availableStock);
  }

  return prisma.$transaction(async (tx) => {
    const auditNumber = await generateDailyAuditNumber(tx, auditDate);
    const audit = await tx.inventoryDailyAudit.create({
      data: {
        auditNumber,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        auditDate,
        status: DailyAuditStatus.DRAFT,
        createdById: input.createdById,
      },
    });

    if (products.length > 0) {
      await tx.inventoryDailyAuditLine.createMany({
        data: products.map((product) => ({
          auditId: audit.id,
          productId: product.id,
          systemQty: systemQtys.get(product.id) ?? 0,
        })),
      });
    }

    return tx.inventoryDailyAudit.findUniqueOrThrow({
      where: { id: audit.id },
      include: dailyAuditInclude,
    });
  });
}

export async function updateDailyAuditLine(
  prisma: PrismaClient,
  input: {
    companyId: string;
    auditId: string;
    lineId: string;
    physicalQty: number;
    remarks?: string | null;
  },
) {
  const audit = await prisma.inventoryDailyAudit.findFirst({
    where: { id: input.auditId, companyId: input.companyId },
  });
  if (!audit) throw new Error("NOT_FOUND");
  if (audit.status !== DailyAuditStatus.DRAFT) {
    throw new Error("AUDIT_LOCKED");
  }
  if (input.physicalQty < 0) throw new Error("INVALID_QUANTITY");

  const line = await prisma.inventoryDailyAuditLine.findFirst({
    where: { id: input.lineId, auditId: audit.id },
  });
  if (!line) throw new Error("LINE_NOT_FOUND");

  return prisma.inventoryDailyAuditLine.update({
    where: { id: line.id },
    data: {
      physicalQty: input.physicalQty,
      remarks: input.remarks ?? null,
    },
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function submitDailyAudit(
  prisma: PrismaClient,
  input: { companyId: string; auditId: string; submittedById: string },
) {
  const audit = await getDailyAudit(prisma, input.companyId, input.auditId);
  if (audit.status !== DailyAuditStatus.DRAFT) {
    throw new Error("AUDIT_LOCKED");
  }

  const missing = audit.lines.filter((line) => line.physicalQty == null);
  if (missing.length > 0) {
    throw new Error("COUNTS_INCOMPLETE");
  }

  return prisma.$transaction(async (tx) => {
    for (const line of audit.lines) {
      const physical = decimalToNumber(line.physicalQty!);
      const system = decimalToNumber(line.systemQty);
      await tx.inventoryDailyAuditLine.update({
        where: { id: line.id },
        data: {
          varianceQty: physical - system,
        },
      });
    }

    return tx.inventoryDailyAudit.update({
      where: { id: audit.id },
      data: {
        status: DailyAuditStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedById: input.submittedById,
      },
      include: dailyAuditInclude,
    });
  });
}

export function serializeOpeningAudit(
  audit: Prisma.InventoryOpeningAuditGetPayload<{
    include: typeof openingAuditInclude;
  }>,
) {
  return {
    ...audit,
    lines: audit.lines.map((line) => ({
      ...line,
      physicalQty: decimalToNumber(line.physicalQty),
      scannedQty: line.serials.length,
    })),
  };
}

export function serializeDailyAudit(
  audit: Prisma.InventoryDailyAuditGetPayload<{
    include: typeof dailyAuditInclude;
  }>,
  options: { revealSystemQty: boolean },
) {
  const reveal =
    options.revealSystemQty || audit.status === DailyAuditStatus.SUBMITTED;

  return {
    ...audit,
    auditDate: audit.auditDate.toISOString(),
    submittedAt: audit.submittedAt?.toISOString() ?? null,
    createdAt: audit.createdAt.toISOString(),
    updatedAt: audit.updatedAt.toISOString(),
    lines: audit.lines.map((line) => {
      const physicalQty =
        line.physicalQty == null ? null : decimalToNumber(line.physicalQty);
      const systemQty = decimalToNumber(line.systemQty);
      const varianceQty =
        line.varianceQty == null ? null : decimalToNumber(line.varianceQty);

      return {
        ...line,
        physicalQty,
        systemQty: reveal ? systemQty : null,
        varianceQty: reveal ? varianceQty : null,
        hasVariance:
          reveal && varianceQty != null ? varianceQty !== 0 : null,
      };
    }),
  };
}
