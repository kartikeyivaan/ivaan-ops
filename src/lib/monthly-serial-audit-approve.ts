import {
  MonthlyAuditStatus,
  SerialStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { writeAuditLogTx } from "@/lib/audit";
import { getWarehouseStockForProduct, adjustStock } from "@/lib/inventory-service";
import { monthlyAuditCompanyFilter, monthlyAuditExcludedCompanyFilter } from "@/lib/monthly-serial-audit-scope";
import { nextMonthlyAuditStatus } from "@/lib/monthly-serial-audit-service";

/**
 * Reconciliation and approval for the monthly serial audit (Phase 4).
 *
 * Serialized products (section A), per the approved reconciliation table:
 * - OK (record and audit both available): no change.
 * - Missing (record available, not scanned): investigation list. Not changed here.
 * - Additional (scanned, not in record): investigation list. Not added here;
 *   added later through manual stock entry.
 * So approval writes no serial changes. It re-checks each snapshot serial and
 * reports any that left AVAILABLE after the snapshot (for example, dispatched
 * while the run was CLOSED). Those are reported, never changed.
 *
 * Non-serialized products (section B): approval sets inventory to the audited
 * quantity, through the existing adjustStock, inside the approval transaction.
 */

const QTY_LINE_CHUNK = 500;

function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

/** Section B: one line per non-serialized product, per company and warehouse, with the system quantity. */
export async function createMonthlyAuditQtyLines(
  prisma: PrismaClient,
  auditId: string,
): Promise<number> {
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, serialTracking: false },
      select: { id: true },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true, company: monthlyAuditCompanyFilter },
      select: { id: true, companyId: true },
    }),
  ]);

  let created = 0;
  for (const warehouse of warehouses) {
    const rows: Prisma.InventoryMonthlyAuditQtyLineCreateManyInput[] = [];
    for (const product of products) {
      const stock = await getWarehouseStockForProduct(
        prisma,
        warehouse.companyId,
        product.id,
        warehouse.id,
      );
      // Only products with stock on hand need a count. Others can be added by hand.
      if (stock.availableStock <= 0) continue;
      rows.push({
        auditId,
        productId: product.id,
        companyId: warehouse.companyId,
        warehouseId: warehouse.id,
        recordQty: stock.availableStock,
      });
    }
    for (let i = 0; i < rows.length; i += QTY_LINE_CHUNK) {
      const result = await prisma.inventoryMonthlyAuditQtyLine.createMany({
        data: rows.slice(i, i + QTY_LINE_CHUNK),
        skipDuplicates: true,
      });
      created += result.count;
    }
  }
  return created;
}

/** Section B entry: a warehouse user records the counted quantity. Only while OPEN. */
export async function updateMonthlyAuditQtyLine(
  prisma: PrismaClient,
  input: { auditId: string; lineId: string; auditQty: number; userId: string },
) {
  if (!Number.isFinite(input.auditQty) || input.auditQty < 0) {
    throw new Error("INVALID_QUANTITY");
  }
  const audit = await prisma.inventoryMonthlyAudit.findUnique({
    where: { id: input.auditId },
    select: { status: true },
  });
  if (!audit) throw new Error("NOT_FOUND");
  if (audit.status !== MonthlyAuditStatus.OPEN) throw new Error("AUDIT_NOT_OPEN");

  const line = await prisma.inventoryMonthlyAuditQtyLine.findFirst({
    where: { id: input.lineId, auditId: input.auditId },
  });
  if (!line) throw new Error("LINE_NOT_FOUND");

  const recordQty = toNumber(line.recordQty) ?? 0;
  return prisma.inventoryMonthlyAuditQtyLine.update({
    where: { id: line.id },
    data: { auditQty: input.auditQty, varianceQty: input.auditQty - recordQty },
  });
}

/** Read-only view for the reconciliation screen and the Excel export. */
export async function getMonthlyAuditReconciliation(
  prisma: PrismaClient,
  auditId: string,
) {
  const audit = await prisma.inventoryMonthlyAudit.findUnique({
    where: { id: auditId },
    select: { id: true, auditNumber: true, status: true, approvedAt: true },
  });
  if (!audit) throw new Error("NOT_FOUND");

  const [missing, additional, expected, scanned, qtyLines] = await Promise.all([
    prisma.inventoryMonthlyAuditFinding.findMany({
      where: { auditId, type: "MISSING" },
      include: { product: { select: { displayName: true } } },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.inventoryMonthlyAuditFinding.findMany({
      where: { auditId, type: "ADDITIONAL" },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.inventoryMonthlyAuditSnapshot.count({ where: { auditId } }),
    prisma.inventoryMonthlyAuditScan.count({ where: { auditId, result: "FOUND" } }),
    prisma.inventoryMonthlyAuditQtyLine.findMany({
      where: { auditId },
      include: {
        product: { select: { displayName: true } },
        warehouse: { select: { name: true } },
        company: { select: { name: true } },
      },
      orderBy: [{ companyId: "asc" }, { warehouseId: "asc" }],
    }),
  ]);

  return {
    audit,
    serial: { expected, found: scanned, missing, additional },
    qty: qtyLines.map((line) => ({
      ...line,
      recordQty: toNumber(line.recordQty),
      auditQty: toNumber(line.auditQty),
      varianceQty: toNumber(line.varianceQty),
    })),
  };
}

export async function approveMonthlyAudit(
  prisma: PrismaClient,
  input: { auditId: string; userId: string },
) {
  // Stock reads happen before the transaction; the run lock below stops a
  // second approval. Dispatch can still move stock while CLOSED (by design),
  // so the audited quantity is applied as a delta against stock read here.
  const preview = await prisma.inventoryMonthlyAudit.findUnique({
    where: { id: input.auditId },
    select: { status: true },
  });
  if (!preview) throw new Error("NOT_FOUND");
  nextMonthlyAuditStatus(preview.status, "approve");

  // Uncounted products do not block approval. They are left unchanged and reported as a warning.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM inventory_monthly_audits WHERE id = ${input.auditId}::uuid FOR UPDATE`;

    const audit = await tx.inventoryMonthlyAudit.findUniqueOrThrow({
      where: { id: input.auditId },
    });
    const nextStatus = nextMonthlyAuditStatus(audit.status, "approve");

    // Re-check serials: any snapshot serial no longer AVAILABLE is reported, not changed.
    const changedSinceSnapshot = await tx.inventorySerial.findMany({
      where: {
        status: { not: SerialStatus.AVAILABLE },
        monthlyAuditSnapshots: { some: { auditId: audit.id } },
      },
      select: { id: true, serialNumber: true, status: true },
    });

    // Investigation. Missing serials leave available stock but stay in the system.
    const missingFindings = await tx.inventoryMonthlyAuditFinding.findMany({
      where: { auditId: audit.id, type: "MISSING", serialId: { not: null } },
      select: { serialId: true },
    });
    let missingMarked = 0;
    const missingIds = missingFindings.map((f) => f.serialId as string);
    for (let i = 0; i < missingIds.length; i += QTY_LINE_CHUNK) {
      const result = await tx.inventorySerial.updateMany({
        where: { id: { in: missingIds.slice(i, i + QTY_LINE_CHUNK) }, status: SerialStatus.AVAILABLE },
        data: { status: SerialStatus.UNDER_INVESTIGATION },
      });
      missingMarked += result.count;
    }

    // Additional serials are physically present but the system shows them as not in stock
    // (for example DISPATCHED or REMOVED). Put the matching record under investigation (new addition).
    // Skip any serial number that already has a live copy, so the live-uniqueness rule holds.
    const additionalFindings = await tx.inventoryMonthlyAuditFinding.findMany({
      where: { auditId: audit.id, type: "ADDITIONAL" },
      select: { id: true, serialNumber: true },
    });
    let additionalMarked = 0;
    for (const finding of additionalFindings) {
      // Excluded companies (e.g. Ivaan Demo) are out of scope; never touch their records.
      const excluded = await tx.inventorySerial.findFirst({
        where: { serialNumber: finding.serialNumber, currentWarehouse: { company: monthlyAuditExcludedCompanyFilter } },
        select: { id: true },
      });
      if (excluded) continue;
      const live = await tx.inventorySerial.findFirst({
        where: {
          serialNumber: finding.serialNumber,
          status: {
            in: [SerialStatus.AVAILABLE, SerialStatus.BOOKED, SerialStatus.DAMAGED, SerialStatus.DAMAGE_PENDING, SerialStatus.UNDER_INVESTIGATION],
          },
        },
        select: { id: true },
      });
      if (live) continue;
      const record = await tx.inventorySerial.findFirst({
        where: {
          serialNumber: finding.serialNumber,
          status: { in: [SerialStatus.DISPATCHED, SerialStatus.REMOVED] },
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (!record) continue;
      await tx.inventorySerial.update({
        where: { id: record.id },
        data: { status: SerialStatus.UNDER_INVESTIGATION },
      });
      await tx.inventoryMonthlyAuditFinding.update({
        where: { id: finding.id },
        data: { serialId: record.id },
      });
      additionalMarked += 1;
    }

    let adjustments = 0;
    let uncountedCount = 0;
    const lines = await tx.inventoryMonthlyAuditQtyLine.findMany({
      where: { auditId: audit.id, approved: false },
    });
    for (const line of lines) {
      const auditQty = toNumber(line.auditQty);
      if (auditQty == null) {
        // Not counted: leave stock as it is. Warn if the system shows stock for it.
        if ((toNumber(line.recordQty) ?? 0) > 0) uncountedCount += 1;
        continue;
      }
      const current = await getWarehouseStockForProduct(
        prisma,
        line.companyId,
        line.productId,
        line.warehouseId,
      );
      const delta = auditQty - current.availableStock;
      if (delta !== 0) {
        await adjustStock(
          prisma,
          {
            companyId: line.companyId,
            productId: line.productId,
            warehouseId: line.warehouseId,
            qty: delta,
            notes: `Monthly audit ${audit.auditNumber}`,
            createdById: input.userId,
          },
          tx,
        );
        adjustments += 1;
      }
      await tx.inventoryMonthlyAuditQtyLine.update({
        where: { id: line.id },
        data: { approved: true },
      });
    }

    const updated = await tx.inventoryMonthlyAudit.update({
      where: { id: audit.id },
      data: {
        status: nextStatus,
        approvedAt: new Date(),
        approvedById: input.userId,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: audit.id,
      action: "APPROVE",
      oldValue: { status: audit.status },
      newValue: {
        status: nextStatus,
        qtyAdjustments: adjustments,
        changedSinceSnapshot: changedSinceSnapshot.length,
      },
      performedBy: input.userId,
    });

    return {
      audit: updated,
      qtyAdjustments: adjustments,
      uncountedCount,
      missingMarked,
      additionalMarked,
      changedSinceSnapshot,
    };
  }, {
    // Default is 5 seconds; approval touches every section B line and can take longer.
    timeout: 120_000,
    maxWait: 10_000,
  });
}
