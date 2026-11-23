import { MonthlyAuditStatus, SerialStatus, type Prisma, type PrismaClient } from "@prisma/client";

import { writeAuditLogTx } from "@/lib/audit";
import { monthlyAuditCompanyFilter } from "@/lib/monthly-serial-audit-scope";

/**
 * Investigation of serials after a monthly audit is approved.
 *
 * - Missing and new-addition serials sit under investigation (status UNDER_INVESTIGATION).
 * - Found: the serial returns to available stock (same warehouse it was recorded in).
 * - Written off: the serial is removed from stock. An optional note is kept.
 * - Added: for a new addition with no serial record. Confirms a manual stock entry exists.
 * - Sold: not set here. It closes automatically when the serial is dispatched.
 * - Only Super Admin resolves, closes and reopens. Close needs every item resolved.
 */

export const MAX_INVESTIGATION_BATCH = 1000;

export type InvestigationAction = "FOUND" | "WRITE_OFF" | "ADDED";

const LIVE_STATUSES: SerialStatus[] = [
  SerialStatus.AVAILABLE,
  SerialStatus.BOOKED,
  SerialStatus.DAMAGED,
  SerialStatus.DAMAGE_PENDING,
  SerialStatus.UNDER_INVESTIGATION,
];

async function loadApprovedRun(prisma: PrismaClient | Prisma.TransactionClient, auditId: string) {
  const audit = await prisma.inventoryMonthlyAudit.findUnique({
    where: { id: auditId },
    select: { id: true, status: true, investigationClosedAt: true },
  });
  if (!audit) throw new Error("NOT_FOUND");
  if (audit.status !== MonthlyAuditStatus.APPROVED) throw new Error("RUN_NOT_APPROVED");
  return audit;
}

export async function listInvestigation(
  prisma: PrismaClient,
  auditId: string,
  type: "MISSING" | "ADDITIONAL",
) {
  const rows = await prisma.inventoryMonthlyAuditFinding.findMany({
    where: {
      auditId,
      type,
      // Excluded companies (e.g. Ivaan Demo) are dropped from the audit.
      OR: [
        { serial: null },
        { serial: { currentWarehouse: { company: monthlyAuditCompanyFilter } } },
      ],
    },
    orderBy: { serialNumber: "asc" },
    include: {
      serial: {
        select: {
          status: true,
          currentWarehouse: { select: { name: true, company: { select: { name: true } } } },
          product: { select: { displayName: true } },
        },
      },
      product: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    serialNumber: r.serialNumber,
    type: r.type,
    product: r.serial?.product.displayName ?? r.product?.displayName ?? "-",
    company: r.serial?.currentWarehouse.company.name ?? "-",
    warehouse: r.serial?.currentWarehouse.name ?? "-",
    serialStatus: r.serial?.status ?? null,
    resolution: r.resolution,
    resolutionNote: r.resolutionNote,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    hasRecord: r.serialId != null,
  }));
}

export async function resolveInvestigation(
  prisma: PrismaClient,
  input: {
    auditId: string;
    userId: string;
    action: InvestigationAction;
    findingIds?: string[];
    serialNumbers?: string[];
    note?: string | null;
  },
) {
  const ids = input.findingIds ?? [];
  const numbers = (input.serialNumbers ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (ids.length + numbers.length === 0) throw new Error("NO_ITEMS_SELECTED");
  if (ids.length + numbers.length > MAX_INVESTIGATION_BATCH) throw new Error("TOO_MANY_ITEMS");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM inventory_monthly_audits WHERE id = ${input.auditId}::uuid FOR UPDATE`;
    const audit = await loadApprovedRun(tx, input.auditId);
    if (audit.investigationClosedAt) throw new Error("INVESTIGATION_CLOSED");

    const findings = await tx.inventoryMonthlyAuditFinding.findMany({
      where: {
        auditId: input.auditId,
        resolvedAt: null,
        OR: [
          ...(ids.length ? [{ id: { in: ids } }] : []),
          ...(numbers.length ? [{ serialNumber: { in: numbers } }] : []),
        ],
      },
    });
    if (findings.length === 0) throw new Error("NO_OPEN_ITEMS");

    const note = input.note?.trim() || null;
    let changed = 0;

    for (const f of findings) {
      if (input.action === "ADDED") {
        if (f.type !== "ADDITIONAL") throw new Error("ACTION_NOT_ALLOWED");
        // Added only once a stock entry for this serial exists and is available.
        const added = await tx.inventorySerial.findFirst({
          where: { serialNumber: f.serialNumber, status: SerialStatus.AVAILABLE },
          select: { id: true },
        });
        if (!added) throw new Error("NOT_YET_ADDED");
      } else if (f.serialId) {
        const serial = await tx.inventorySerial.findUnique({
          where: { id: f.serialId },
          select: { id: true, status: true, serialNumber: true },
        });
        if (!serial || serial.status !== SerialStatus.UNDER_INVESTIGATION) {
          throw new Error("SERIAL_NOT_UNDER_INVESTIGATION");
        }
        if (input.action === "FOUND") {
          const other = await tx.inventorySerial.findFirst({
            where: { serialNumber: serial.serialNumber, id: { not: serial.id }, status: { in: LIVE_STATUSES } },
            select: { id: true },
          });
          if (other) throw new Error("LIVE_COPY_EXISTS");
          await tx.inventorySerial.update({ where: { id: serial.id }, data: { status: SerialStatus.AVAILABLE } });
        } else {
          await tx.inventorySerial.update({ where: { id: serial.id }, data: { status: SerialStatus.REMOVED } });
        }
      } else if (input.action === "FOUND") {
        // No serial record exists, so nothing can be returned to stock.
        throw new Error("NO_SERIAL_RECORD");
      }

      await tx.inventoryMonthlyAuditFinding.update({
        where: { id: f.id },
        data: {
          resolution: input.action,
          resolutionNote: note,
          resolvedAt: new Date(),
          resolvedById: input.userId,
        },
      });
      changed += 1;
    }

    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: input.auditId,
      action: "UPDATE",
      newValue: { investigation: input.action, count: changed, note },
      performedBy: input.userId,
    });

    return { resolved: changed, requested: ids.length + numbers.length, found: findings.length };
  }, {
    // Default is 5 seconds; a batch of up to 1,000 serials needs more time.
    timeout: 300_000,
    maxWait: 10_000,
  });
}

export async function closeInvestigation(prisma: PrismaClient, input: { auditId: string; userId: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM inventory_monthly_audits WHERE id = ${input.auditId}::uuid FOR UPDATE`;
    const audit = await loadApprovedRun(tx, input.auditId);
    if (audit.investigationClosedAt) throw new Error("INVESTIGATION_CLOSED");

    const open = await tx.inventoryMonthlyAuditFinding.count({
      where: { auditId: input.auditId, type: { in: ["MISSING", "ADDITIONAL"] }, resolvedAt: null },
    });
    if (open > 0) throw new Error("OPEN_ITEMS_REMAIN");

    const updated = await tx.inventoryMonthlyAudit.update({
      where: { id: input.auditId },
      data: { investigationClosedAt: new Date(), investigationClosedById: input.userId },
    });
    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: input.auditId,
      action: "UPDATE",
      newValue: { investigation: "CLOSED" },
      performedBy: input.userId,
    });
    return updated;
  });
}

export async function reopenInvestigation(prisma: PrismaClient, input: { auditId: string; userId: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("CANCEL_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const audit = await loadApprovedRun(tx, input.auditId);
    if (!audit.investigationClosedAt) throw new Error("INVESTIGATION_NOT_CLOSED");
    const updated = await tx.inventoryMonthlyAudit.update({
      where: { id: input.auditId },
      data: { investigationClosedAt: null, investigationClosedById: null },
    });
    await writeAuditLogTx(tx, {
      tableName: "inventory_monthly_audits",
      recordId: input.auditId,
      action: "UPDATE",
      newValue: { investigation: "REOPENED", reason },
      performedBy: input.userId,
    });
    return updated;
  });
}
