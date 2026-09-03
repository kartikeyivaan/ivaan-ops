import type { PrismaClient, SerialStatus } from "@prisma/client";
import { normalizeSerialNumber } from "@/lib/inventory";

export type SerialHistoryEventType =
  | "RECEIVED"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "DISPATCHED"
  | "PROJECT_DISPATCHED"
  | "DAMAGE_REPORTED"
  | "DAMAGE_APPROVED"
  | "DAMAGE_REJECTED"
  | "MANUAL_IN"
  | "MANUAL_OUT"
  | "MANUAL_CONDITION_CHANGE";

export type SerialHistoryEvent = {
  id: string;
  type: SerialHistoryEventType;
  occurredAt: string;
  label: string;
  direction: "IN" | "OUT" | "STATUS";
  warehouseName: string | null;
  fromWarehouseName: string | null;
  toWarehouseName: string | null;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  href: string | null;
  notes: string | null;
  actorName: string | null;
};

export type SerialPhysicalHistory = {
  serial: {
    id: string;
    serialNumber: string;
    status: SerialStatus;
    createdAt: string;
    product: { id: string; displayName: string };
    currentWarehouse: { id: string; name: string; companyId: string };
    lot: {
      id: string;
      lotNumber: string;
      purchaseInvoiceNo: string;
      companyId: string;
      warehouse: { id: string; name: string };
    };
  };
  events: SerialHistoryEvent[];
};

function companyTouchesSerial(
  companyId: string,
  serial: {
    lot: { companyId: string };
    currentWarehouse: { companyId: string };
    transferLineSerials: Array<{
      line: {
        transfer: { fromCompanyId: string; toCompanyId: string };
      };
    }>;
    dispatchLineSerials: Array<{
      line: { dispatch: { companyId: string } };
    }>;
    projectDispatchLineSerials: Array<{
      dispatchLine: { dispatch: { companyId: string } };
    }>;
    damageReports: Array<{ companyId: string }>;
    manualStockEntryLines: Array<{
      entry: { companyId: string };
    }>;
  },
): boolean {
  if (serial.lot.companyId === companyId) return true;
  if (serial.currentWarehouse.companyId === companyId) return true;
  if (
    serial.transferLineSerials.some(
      (row) =>
        row.line.transfer.fromCompanyId === companyId ||
        row.line.transfer.toCompanyId === companyId,
    )
  ) {
    return true;
  }
  if (
    serial.dispatchLineSerials.some(
      (row) => row.line.dispatch.companyId === companyId,
    )
  ) {
    return true;
  }
  if (
    serial.projectDispatchLineSerials.some(
      (row) => row.dispatchLine.dispatch.companyId === companyId,
    )
  ) {
    return true;
  }
  if (serial.damageReports.some((row) => row.companyId === companyId)) return true;
  if (
    serial.manualStockEntryLines.some((row) => row.entry.companyId === companyId)
  ) {
    return true;
  }
  return false;
}

/**
 * Reconstruct physical movement timeline for one QR/serial (oldest → newest).
 * Excludes sales booking; includes receive, transfer, dispatch, damage, manual stock.
 */
export async function getSerialPhysicalHistory(
  prisma: PrismaClient,
  companyId: string,
  serialNumberInput: string,
): Promise<SerialPhysicalHistory | null> {
  const serialNumber = normalizeSerialNumber(serialNumberInput);
  if (!serialNumber) return null;

  const serial = await prisma.inventorySerial.findUnique({
    where: { serialNumber },
    include: {
      product: { select: { id: true, displayName: true } },
      currentWarehouse: { select: { id: true, name: true, companyId: true } },
      lot: {
        select: {
          id: true,
          lotNumber: true,
          purchaseInvoiceNo: true,
          companyId: true,
          warehouse: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
        },
      },
      transferLineSerials: {
        include: {
          line: {
            include: {
              transfer: {
                include: {
                  dispatchedBy: { select: { name: true } },
                  receivedBy: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      dispatchLineSerials: {
        include: {
          line: {
            include: {
              dispatch: {
                include: {
                  warehouse: { select: { id: true, name: true } },
                  customer: { select: { customerName: true } },
                  dispatchedBy: { select: { name: true } },
                  createdBy: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      projectDispatchLineSerials: {
        include: {
          dispatchLine: {
            include: {
              dispatch: {
                include: {
                  warehouse: { select: { id: true, name: true } },
                  project: {
                    select: { id: true, projectNo: true, customerName: true },
                  },
                  createdBy: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      damageReports: {
        include: {
          warehouse: { select: { id: true, name: true } },
          requestedBy: { select: { name: true } },
          decidedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      manualStockEntryLines: {
        include: {
          entry: {
            include: {
              warehouse: { select: { id: true, name: true } },
              createdBy: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!serial || !companyTouchesSerial(companyId, serial)) {
    return null;
  }

  const transferWarehouseIds = new Set<string>();
  for (const row of serial.transferLineSerials) {
    transferWarehouseIds.add(row.line.transfer.fromWarehouseId);
    transferWarehouseIds.add(row.line.transfer.toWarehouseId);
  }
  const transferWarehouses =
    transferWarehouseIds.size > 0
      ? await prisma.warehouse.findMany({
          where: { id: { in: [...transferWarehouseIds] } },
          select: { id: true, name: true },
        })
      : [];
  const transferWarehouseById = new Map(
    transferWarehouses.map((w) => [w.id, w.name]),
  );

  const events: SerialHistoryEvent[] = [];

  events.push({
    id: `received-${serial.id}`,
    type: "RECEIVED",
    occurredAt: serial.createdAt.toISOString(),
    label: "Received into stock",
    direction: "IN",
    warehouseName: serial.lot.warehouse.name,
    fromWarehouseName: null,
    toWarehouseName: serial.lot.warehouse.name,
    referenceType: "LOT",
    referenceId: serial.lot.id,
    referenceNumber: serial.lot.lotNumber,
    href: `/inventory/incoming/${serial.lot.id}`,
    notes: `Purchase invoice ${serial.lot.purchaseInvoiceNo}`,
    actorName: serial.lot.createdBy.name,
  });

  for (const row of serial.transferLineSerials) {
    const transfer = row.line.transfer;
    const fromName =
      transferWarehouseById.get(transfer.fromWarehouseId) ?? "Unknown warehouse";
    const toName =
      transferWarehouseById.get(transfer.toWarehouseId) ?? "Unknown warehouse";
    if (transfer.dispatchedAt) {
      events.push({
        id: `transfer-out-${transfer.id}-${serial.id}`,
        type: "TRANSFER_OUT",
        occurredAt: transfer.dispatchedAt.toISOString(),
        label: "Transfer dispatched",
        direction: "OUT",
        warehouseName: fromName,
        fromWarehouseName: fromName,
        toWarehouseName: toName,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        referenceNumber: transfer.transferNumber,
        href: `/inventory/transfers/${transfer.id}`,
        notes: transfer.notes,
        actorName: transfer.dispatchedBy?.name ?? null,
      });
    }
    if (transfer.receivedAt) {
      events.push({
        id: `transfer-in-${transfer.id}-${serial.id}`,
        type: "TRANSFER_IN",
        occurredAt: transfer.receivedAt.toISOString(),
        label: "Transfer received",
        direction: "IN",
        warehouseName: toName,
        fromWarehouseName: fromName,
        toWarehouseName: toName,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        referenceNumber: transfer.transferNumber,
        href: `/inventory/transfers/${transfer.id}`,
        notes: transfer.notes,
        actorName: transfer.receivedBy?.name ?? null,
      });
    }
  }

  for (const row of serial.dispatchLineSerials) {
    const dispatch = row.line.dispatch;
    if (dispatch.status === "DRAFT" || dispatch.status === "CANCELLED") continue;
    const occurredAt =
      dispatch.dispatchedAt?.toISOString() ??
      dispatch.dispatchDate.toISOString();
    events.push({
      id: `dispatch-${dispatch.id}-${serial.id}`,
      type: "DISPATCHED",
      occurredAt,
      label: "Dispatched to customer",
      direction: "OUT",
      warehouseName: dispatch.warehouse.name,
      fromWarehouseName: dispatch.warehouse.name,
      toWarehouseName: null,
      referenceType: "DISPATCH",
      referenceId: dispatch.id,
      referenceNumber: dispatch.dcNo,
      href: `/inventory/dispatches/${dispatch.id}`,
      notes: dispatch.customer.customerName,
      actorName: dispatch.dispatchedBy?.name ?? dispatch.createdBy.name,
    });
  }

  for (const row of serial.projectDispatchLineSerials) {
    const dispatch = row.dispatchLine.dispatch;
    if (dispatch.status === "DRAFT" || dispatch.status === "CANCELLED") continue;
    events.push({
      id: `project-dispatch-${dispatch.id}-${serial.id}`,
      type: "PROJECT_DISPATCHED",
      occurredAt: (dispatch.dispatchedAt ?? dispatch.createdAt).toISOString(),
      label: "Dispatched to project site",
      direction: "OUT",
      warehouseName: dispatch.warehouse.name,
      fromWarehouseName: dispatch.warehouse.name,
      toWarehouseName: null,
      referenceType: "PROJECT_DISPATCH",
      referenceId: dispatch.id,
      referenceNumber: dispatch.dispatchNo,
      href: `/inventory/dispatches/projects/${dispatch.id}`,
      notes: `${dispatch.project.projectNo} · ${dispatch.project.customerName}`,
      actorName: dispatch.createdBy.name,
    });
  }

  for (const report of serial.damageReports) {
    events.push({
      id: `damage-reported-${report.id}`,
      type: "DAMAGE_REPORTED",
      occurredAt: report.createdAt.toISOString(),
      label: "Damage reported",
      direction: "STATUS",
      warehouseName: report.warehouse.name,
      fromWarehouseName: report.warehouse.name,
      toWarehouseName: null,
      referenceType: "DAMAGE_REPORT",
      referenceId: report.id,
      referenceNumber: null,
      href: `/inventory/damaged`,
      notes: report.reason,
      actorName: report.requestedBy.name,
    });

    if (report.decidedAt && report.status === "APPROVED") {
      events.push({
        id: `damage-approved-${report.id}`,
        type: "DAMAGE_APPROVED",
        occurredAt: report.decidedAt.toISOString(),
        label: "Damage approved (removed from sellable stock)",
        direction: "OUT",
        warehouseName: report.warehouse.name,
        fromWarehouseName: report.warehouse.name,
        toWarehouseName: null,
        referenceType: "DAMAGE_REPORT",
        referenceId: report.id,
        referenceNumber: null,
        href: `/inventory/damaged`,
        notes: report.decisionRemarks ?? report.reason,
        actorName: report.decidedBy?.name ?? null,
      });
    }

    if (report.decidedAt && report.status === "REJECTED") {
      events.push({
        id: `damage-rejected-${report.id}`,
        type: "DAMAGE_REJECTED",
        occurredAt: report.decidedAt.toISOString(),
        label: "Damage report rejected",
        direction: "STATUS",
        warehouseName: report.warehouse.name,
        fromWarehouseName: report.warehouse.name,
        toWarehouseName: null,
        referenceType: "DAMAGE_REPORT",
        referenceId: report.id,
        referenceNumber: null,
        href: `/inventory/damaged`,
        notes: report.decisionRemarks ?? report.reason,
        actorName: report.decidedBy?.name ?? null,
      });
    }
  }

  for (const line of serial.manualStockEntryLines) {
    const entry = line.entry;
    const action = entry.action;
    const type: SerialHistoryEventType =
      action === "IN"
        ? "MANUAL_IN"
        : action === "OUT"
          ? "MANUAL_OUT"
          : "MANUAL_CONDITION_CHANGE";
    const direction =
      action === "IN" ? "IN" : action === "OUT" ? "OUT" : "STATUS";
    events.push({
      id: `manual-${entry.id}-${line.id}`,
      type,
      occurredAt: entry.createdAt.toISOString(),
      label:
        action === "IN"
          ? "Manual stock in"
          : action === "OUT"
            ? "Manual stock out"
            : "Manual condition change",
      direction,
      warehouseName: entry.warehouse.name,
      fromWarehouseName: action === "OUT" ? entry.warehouse.name : null,
      toWarehouseName: action === "IN" ? entry.warehouse.name : entry.warehouse.name,
      referenceType: "MANUAL_STOCK",
      referenceId: entry.id,
      referenceNumber: entry.entryNumber,
      href: `/inventory/manual-stock`,
      notes: entry.notes,
      actorName: entry.createdBy.name,
    });
  }

  events.sort((a, b) => {
    const byTime = a.occurredAt.localeCompare(b.occurredAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });

  return {
    serial: {
      id: serial.id,
      serialNumber: serial.serialNumber,
      status: serial.status,
      createdAt: serial.createdAt.toISOString(),
      product: serial.product,
      currentWarehouse: serial.currentWarehouse,
      lot: {
        id: serial.lot.id,
        lotNumber: serial.lot.lotNumber,
        purchaseInvoiceNo: serial.lot.purchaseInvoiceNo,
        companyId: serial.lot.companyId,
        warehouse: serial.lot.warehouse,
      },
    },
    events,
  };
}
