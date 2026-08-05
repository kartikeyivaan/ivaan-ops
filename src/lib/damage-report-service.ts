import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  DamageCategory,
  DamageReportStatus,
  InventoryTransactionType,
  PrismaClient,
  SerialStatus,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { DAMAGE_CATEGORY_LABELS } from "@/lib/damage-report-constants";
import { normalizeSerialNumber } from "@/lib/inventory";

export { DAMAGE_CATEGORY_LABELS } from "@/lib/damage-report-constants";

const MODULES_CATEGORY = "Modules";

export type DamageReportRecord = {
  id: string;
  serialNumber: string;
  category: DamageCategory;
  categoryLabel: string;
  reason: string;
  status: DamageReportStatus;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  lotNumber: string | null;
  requestedByName: string;
  decidedByName: string | null;
  decisionRemarks: string | null;
  createdAt: string;
  decidedAt: string | null;
};

const damageReportInclude = {
  product: { select: { id: true, displayName: true } },
  warehouse: { select: { id: true, name: true } },
  serial: {
    select: {
      id: true,
      serialNumber: true,
      status: true,
      lot: { select: { lotNumber: true } },
    },
  },
  requestedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
} as const;

function serializeDamageReport(
  row: {
    id: string;
    serialNumber: string;
    category: DamageCategory;
    reason: string;
    status: DamageReportStatus;
    productId: string;
    warehouseId: string;
    decisionRemarks: string | null;
    createdAt: Date;
    decidedAt: Date | null;
    product: { id: string; displayName: string };
    warehouse: { id: string; name: string };
    serial: { lot: { lotNumber: string } | null };
    requestedBy: { name: string };
    decidedBy: { name: string } | null;
  },
): DamageReportRecord {
  return {
    id: row.id,
    serialNumber: row.serialNumber,
    category: row.category,
    categoryLabel: DAMAGE_CATEGORY_LABELS[row.category],
    reason: row.reason,
    status: row.status,
    productId: row.productId,
    productName: row.product.displayName,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse.name,
    lotNumber: row.serial.lot?.lotNumber ?? null,
    requestedByName: row.requestedBy.name,
    decidedByName: row.decidedBy?.name ?? null,
    decisionRemarks: row.decisionRemarks,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export type DamageSerialLookup = {
  serialId: string;
  serialNumber: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  lotId: string;
  lotNumber: string;
  status: SerialStatus;
};

export async function lookupDamageableSerial(
  prisma: PrismaClient,
  input: { companyId: string; serialNumber: string },
): Promise<DamageSerialLookup> {
  const serialNumber = normalizeSerialNumber(input.serialNumber);
  if (!serialNumber) throw new Error("SERIAL_REQUIRED");

  const serial = await prisma.inventorySerial.findUnique({
    where: { serialNumber },
    include: {
      product: {
        include: { category: { select: { name: true } } },
      },
      currentWarehouse: { select: { id: true, name: true, companyId: true } },
      lot: { select: { id: true, lotNumber: true, companyId: true } },
      damageReports: {
        where: { status: DamageReportStatus.PENDING },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!serial || serial.lot.companyId !== input.companyId) {
    throw new Error("SERIAL_NOT_FOUND");
  }
  if (serial.product.category.name !== MODULES_CATEGORY) {
    throw new Error("NOT_MODULE");
  }
  if (!serial.product.serialTracking) {
    throw new Error("NOT_MODULE");
  }
  if (serial.damageReports.length > 0 || serial.status === SerialStatus.DAMAGE_PENDING) {
    throw new Error("ALREADY_PENDING");
  }
  if (serial.status === SerialStatus.DAMAGED) {
    throw new Error("ALREADY_DAMAGED");
  }
  if (serial.status === SerialStatus.BOOKED) {
    throw new Error("SERIAL_BOOKED");
  }
  if (serial.status === SerialStatus.DISPATCHED) {
    throw new Error("SERIAL_DISPATCHED");
  }
  if (serial.status === SerialStatus.REMOVED) {
    throw new Error("SERIAL_REMOVED");
  }
  if (serial.status !== SerialStatus.AVAILABLE) {
    throw new Error("SERIAL_NOT_AVAILABLE");
  }
  if (serial.currentWarehouse.companyId !== input.companyId) {
    throw new Error("SERIAL_NOT_FOUND");
  }

  return {
    serialId: serial.id,
    serialNumber: serial.serialNumber,
    productId: serial.productId,
    productName: serial.product.displayName,
    warehouseId: serial.currentWarehouseId,
    warehouseName: serial.currentWarehouse.name,
    lotId: serial.lot.id,
    lotNumber: serial.lot.lotNumber,
    status: serial.status,
  };
}

export async function listDamageReports(
  prisma: PrismaClient,
  companyId: string,
  filters: { status?: DamageReportStatus } = {},
): Promise<DamageReportRecord[]> {
  const rows = await prisma.inventoryDamageReport.findMany({
    where: {
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: damageReportInclude,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(serializeDamageReport);
}

export async function getDamageReport(
  prisma: PrismaClient,
  companyId: string,
  id: string,
): Promise<DamageReportRecord | null> {
  const row = await prisma.inventoryDamageReport.findFirst({
    where: { id, companyId },
    include: damageReportInclude,
  });
  return row ? serializeDamageReport(row) : null;
}

export async function createDamageReport(
  prisma: PrismaClient,
  input: {
    companyId: string;
    serialNumber: string;
    category: DamageCategory;
    reason: string;
    requestedById: string;
  },
) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("REASON_REQUIRED");

  const lookup = await lookupDamageableSerial(prisma, {
    companyId: input.companyId,
    serialNumber: input.serialNumber,
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventorySerial.updateMany({
      where: {
        id: lookup.serialId,
        status: SerialStatus.AVAILABLE,
      },
      data: { status: SerialStatus.DAMAGE_PENDING },
    });
    if (updated.count !== 1) throw new Error("SERIAL_NOT_AVAILABLE");

    const report = await tx.inventoryDamageReport.create({
      data: {
        companyId: input.companyId,
        serialId: lookup.serialId,
        productId: lookup.productId,
        warehouseId: lookup.warehouseId,
        serialNumber: lookup.serialNumber,
        category: input.category,
        reason,
        status: DamageReportStatus.PENDING,
        requestedById: input.requestedById,
      },
      include: damageReportInclude,
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.PANEL_DAMAGE,
        moduleId: report.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: `${DAMAGE_CATEGORY_LABELS[input.category]}: ${reason}`,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_damage_reports",
      recordId: report.id,
      action: "CREATE",
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: lookup.serialNumber,
      newValue: {
        status: DamageReportStatus.PENDING,
        category: input.category,
        serialId: lookup.serialId,
      },
    });

    return serializeDamageReport(report);
  });
}

export async function approveDamageReport(
  prisma: PrismaClient,
  input: {
    companyId: string;
    reportId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const report = await prisma.inventoryDamageReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    include: { serial: true },
  });
  if (!report) throw new Error("NOT_FOUND");
  if (report.status !== DamageReportStatus.PENDING) throw new Error("INVALID_STATUS");

  return prisma.$transaction(async (tx) => {
    const serialUpdate = await tx.inventorySerial.updateMany({
      where: {
        id: report.serialId,
        status: SerialStatus.DAMAGE_PENDING,
      },
      data: { status: SerialStatus.DAMAGED },
    });
    if (serialUpdate.count !== 1) throw new Error("SERIAL_NOT_AVAILABLE");

    const updated = await tx.inventoryDamageReport.update({
      where: { id: report.id },
      data: {
        status: DamageReportStatus.APPROVED,
        decidedById: input.approvedById,
        decidedAt: new Date(),
        decisionRemarks: input.remarks?.trim() || null,
      },
      include: damageReportInclude,
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.PANEL_DAMAGE,
        moduleId: report.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks?.trim() || undefined,
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.DAMAGE,
        companyId: input.companyId,
        productId: report.productId,
        lotId: report.serial.lotId,
        qty: 1,
        fromWarehouseId: report.warehouseId,
        referenceType: "DAMAGE_REPORT",
        referenceId: report.id,
        notes: `${DAMAGE_CATEGORY_LABELS[report.category]}: ${report.reason}`,
        createdById: input.approvedById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_damage_reports",
      recordId: report.id,
      action: "UPDATE",
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: report.serialNumber,
      newValue: { status: DamageReportStatus.APPROVED, decision: "APPROVED" },
    });

    return serializeDamageReport(updated);
  });
}

export async function rejectDamageReport(
  prisma: PrismaClient,
  input: {
    companyId: string;
    reportId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("REASON_REQUIRED");

  const report = await prisma.inventoryDamageReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
  });
  if (!report) throw new Error("NOT_FOUND");
  if (report.status !== DamageReportStatus.PENDING) throw new Error("INVALID_STATUS");

  return prisma.$transaction(async (tx) => {
    const serialUpdate = await tx.inventorySerial.updateMany({
      where: {
        id: report.serialId,
        status: SerialStatus.DAMAGE_PENDING,
      },
      data: { status: SerialStatus.AVAILABLE },
    });
    if (serialUpdate.count !== 1) throw new Error("SERIAL_NOT_AVAILABLE");

    const updated = await tx.inventoryDamageReport.update({
      where: { id: report.id },
      data: {
        status: DamageReportStatus.REJECTED,
        decidedById: input.rejectedById,
        decidedAt: new Date(),
        decisionRemarks: reason,
      },
      include: damageReportInclude,
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.PANEL_DAMAGE,
        moduleId: report.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: reason,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_damage_reports",
      recordId: report.id,
      action: "UPDATE",
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: report.serialNumber,
      newValue: {
        status: DamageReportStatus.REJECTED,
        decision: "REJECTED",
        reason,
      },
    });

    return serializeDamageReport(updated);
  });
}
