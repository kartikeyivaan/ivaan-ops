import {
  MonthlyAuditStatus,
  Prisma,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";

import { writeAuditLogTx } from "@/lib/audit";
import { monthlyAuditCompanyFilter } from "@/lib/monthly-serial-audit-scope";
import { getFinancialYear } from "@/lib/inventory";

/**
 * Monthly serial audit run lifecycle (Phase 2).
 *
 * Rules (from docs/prd-monthly-serial-audit.md):
 * - One run at a time across all companies and warehouses. A run is "active"
 *   while it is OPEN or CLOSED (CLOSED = awaiting Super Admin approval).
 * - Freeze: while OPEN, incoming, transfer, adjust and dispatch are blocked.
 *   Dispatch is also blocked while OPEN. It resumes once CLOSED, even before approval.
 * - Start takes a snapshot of every AVAILABLE serial in the system.
 * - Close builds the Missing and Additional findings from the scans.
 * - Cancel is allowed while OPEN or CLOSED. Reopen moves CLOSED back to OPEN.
 */

export const MONTHLY_AUDIT_ACTIVE_STATUSES: MonthlyAuditStatus[] = [
  MonthlyAuditStatus.OPEN,
  MonthlyAuditStatus.CLOSED,
];

export type MonthlyAuditAction = "close" | "cancel" | "reopen" | "approve";

/** Pure state machine. Throws INVALID_TRANSITION for disallowed moves. */
export function nextMonthlyAuditStatus(
  current: MonthlyAuditStatus,
  action: MonthlyAuditAction,
): MonthlyAuditStatus {
  switch (action) {
    case "close":
      if (current === MonthlyAuditStatus.OPEN) return MonthlyAuditStatus.CLOSED;
      break;
    case "cancel":
      if (
        current === MonthlyAuditStatus.OPEN ||
        current === MonthlyAuditStatus.CLOSED
      ) {
        return MonthlyAuditStatus.CANCELLED;
      }
      break;
    case "reopen":
      if (current === MonthlyAuditStatus.CLOSED) return MonthlyAuditStatus.OPEN;
      break;
    case "approve":
      if (current === MonthlyAuditStatus.CLOSED) return MonthlyAuditStatus.APPROVED;
      break;
  }
  throw new Error("INVALID_TRANSITION");
}

const SNAPSHOT_BATCH_SIZE = 1000;
const ADVISORY_LOCK_KEY = "monthly_serial_audit_run";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function generateMonthlyAuditNumber(
  tx: Prisma.TransactionClient,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const prefix = `IMA-${fy}-`;
  const latest = await tx.inventoryMonthlyAudit.findFirst({
    where: { auditNumber: { startsWith: prefix } },
    orderBy: { auditNumber: "desc" },
    select: { auditNumber: true },
  });
  const next = latest ? Number(latest.auditNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/** Returns the run that is OPEN or CLOSED (awaiting approval), if any. */
export async function getActiveMonthlyAudit(prisma: PrismaClient) {
  return prisma.inventoryMonthlyAudit.findFirst({
    where: { status: { in: MONTHLY_AUDIT_ACTIVE_STATUSES } },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Freeze guard for incoming, transfer, adjust and dispatch.
 * Throws INVENTORY_OPS_BLOCKED only while a run is OPEN.
 * Uses the same error code as the opening-stock freeze, so existing
 * route error handling applies.
 */
export async function assertMonthlyAuditAllowsMovement(
  prisma: Pick<PrismaClient, "inventoryMonthlyAudit">,
) {
  const open = await prisma.inventoryMonthlyAudit.findFirst({
    where: { status: MonthlyAuditStatus.OPEN },
    select: { id: true },
  });
  if (open) throw new Error("INVENTORY_OPS_BLOCKED");
}

export async function startMonthlyAudit(
  prisma: PrismaClient,
  input: { startedById: string },
) {
  return prisma.$transaction(async (tx) => {
    // Serialise starts so two users cannot open two runs at once.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_KEY}))`;

    const active = await tx.inventoryMonthlyAudit.findFirst({
      where: { status: { in: MONTHLY_AUDIT_ACTIVE_STATUSES } },
      select: { id: true },
    });
    if (active) throw new Error("MONTHLY_AUDIT_ACTIVE");

    const auditNumber = await generateMonthlyAuditNumber(tx);
    const audit = await tx.inventoryMonthlyAudit.create({
      data: {
        auditNumber,
        status: MonthlyAuditStatus.OPEN,
        startedById: input.startedById,
      },
    });

    const serials = await tx.inventorySerial.findMany({
      where: { status: SerialStatus.AVAILABLE, currentWarehouse: { company: monthlyAuditCompanyFilter } },
      select: {
        id: true,
        serialNumber: true,
        productId: true,
        status: true,
        currentWarehouseId: true,
        currentWarehouse: { select: { companyId: true } },
      },
    });

    for (const batch of chunk(serials, SNAPSHOT_BATCH_SIZE)) {
      await tx.inventoryMonthlyAuditSnapshot.createMany({
        data: batch.map((serial) => ({
          auditId: audit.id,
          serialId: serial.id,
          serialNumber: serial.serialNumber,
          productId: serial.productId,
          companyId: serial.currentWarehouse.companyId,
          warehouseId: serial.currentWarehouseId,
          snapshotStatus: serial.status,
        })),
      });
    }

    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: audit.id,
      action: "CREATE",
      newValue: { auditNumber, snapshotCount: serials.length },
      performedBy: input.startedById,
    });

    return { ...audit, snapshotCount: serials.length };
  });
}

export async function closeMonthlyAudit(
  prisma: PrismaClient,
  input: { auditId: string; userId: string },
) {
  return prisma.$transaction(async (tx) => {
    // Lock the run so no scan can land between building findings and closing.
    await tx.$queryRaw`SELECT id FROM inventory_monthly_audits WHERE id = ${input.auditId}::uuid FOR UPDATE`;
    const audit = await tx.inventoryMonthlyAudit.findUnique({
      where: { id: input.auditId },
    });
    if (!audit) throw new Error("NOT_FOUND");
    const nextStatus = nextMonthlyAuditStatus(audit.status, "close");

    // Rebuild findings from scratch so a reopen-then-close cycle is clean.
    await tx.inventoryMonthlyAuditFinding.deleteMany({ where: { auditId: audit.id } });

    const scans = await tx.inventoryMonthlyAuditScan.findMany({
      where: { auditId: audit.id },
      select: { serialNumber: true, matchedSerialId: true, result: true },
    });
    const scannedSerialIds = new Set(
      scans.filter((s) => s.matchedSerialId).map((s) => s.matchedSerialId as string),
    );

    const snapshots = await tx.inventoryMonthlyAuditSnapshot.findMany({
      where: { auditId: audit.id },
      select: { serialId: true, serialNumber: true, productId: true },
    });
    const missing = snapshots.filter((s) => !scannedSerialIds.has(s.serialId));
    const additional = scans.filter((s) => s.result === "ADDITIONAL");

    for (const batch of chunk(missing, SNAPSHOT_BATCH_SIZE)) {
      await tx.inventoryMonthlyAuditFinding.createMany({
        data: batch.map((s) => ({
          auditId: audit.id,
          type: "MISSING",
          serialId: s.serialId,
          serialNumber: s.serialNumber,
          productId: s.productId,
        })),
      });
    }
    for (const batch of chunk(additional, SNAPSHOT_BATCH_SIZE)) {
      await tx.inventoryMonthlyAuditFinding.createMany({
        data: batch.map((s) => ({
          auditId: audit.id,
          type: "ADDITIONAL",
          serialNumber: s.serialNumber,
        })),
      });
    }

    const updated = await tx.inventoryMonthlyAudit.update({
      where: { id: audit.id },
      data: { status: nextStatus, closedAt: new Date(), closedById: input.userId },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: audit.id,
      action: "UPDATE",
      oldValue: { status: audit.status },
      newValue: { status: nextStatus, missing: missing.length, additional: additional.length },
      performedBy: input.userId,
    });

    return { ...updated, missingCount: missing.length, additionalCount: additional.length };
  }, {
    // Default is 5 seconds; close writes one finding per missing serial and can take longer.
    timeout: 120_000,
    maxWait: 10_000,
  });
}

export async function cancelMonthlyAudit(
  prisma: PrismaClient,
  input: { auditId: string; userId: string; reason: string },
) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("CANCEL_REASON_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const audit = await tx.inventoryMonthlyAudit.findUnique({
      where: { id: input.auditId },
    });
    if (!audit) throw new Error("NOT_FOUND");
    const nextStatus = nextMonthlyAuditStatus(audit.status, "cancel");

    const updated = await tx.inventoryMonthlyAudit.update({
      where: { id: audit.id },
      data: {
        status: nextStatus,
        cancelledAt: new Date(),
        cancelledById: input.userId,
        cancelReason: reason,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: audit.id,
      action: "CANCEL",
      oldValue: { status: audit.status },
      newValue: { status: nextStatus, reason },
      performedBy: input.userId,
    });

    return updated;
  });
}

export async function reopenMonthlyAudit(
  prisma: PrismaClient,
  input: { auditId: string; userId: string },
) {
  return prisma.$transaction(async (tx) => {
    const audit = await tx.inventoryMonthlyAudit.findUnique({
      where: { id: input.auditId },
    });
    if (!audit) throw new Error("NOT_FOUND");
    const nextStatus = nextMonthlyAuditStatus(audit.status, "reopen");

    // Findings are regenerated on the next close.
    await tx.inventoryMonthlyAuditFinding.deleteMany({ where: { auditId: audit.id } });

    const updated = await tx.inventoryMonthlyAudit.update({
      where: { id: audit.id },
      data: {
        status: nextStatus,
        closedAt: null,
        closedById: null,
        reopenCount: { increment: 1 },
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: audit.id,
      action: "UPDATE",
      oldValue: { status: audit.status },
      newValue: { status: nextStatus },
      performedBy: input.userId,
    });

    return updated;
  });
}
