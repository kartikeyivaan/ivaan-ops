import {
  InventoryEventStatus,
  InventoryEventType,
  InventoryTransactionType,
  ProjectDispatchStatus,
  ProjectStatus,
  SerialStatus,
  type PrismaClient,
  type Prisma,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { assertProjectsCompany } from "@/lib/company-scope";
import { decimalToNumber } from "@/lib/inventory";
import { toSignedInventoryQuantity } from "@/lib/inventory-events";
import {
  projectDispatchInclude,
  type ProjectDispatchRecord,
} from "@/lib/project-dispatch-service";
import { generateProjectDispatchNumber } from "@/lib/projects";
import { executeProjectDispatchStockMove } from "@/lib/project-stock-service";
import { findJalgaonProjectsWarehouse } from "@/lib/project-service";
import { SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD } from "@/lib/simple-project-dispatch";
import { resolveStoredSerials } from "@/lib/serial-resolution";
import { findLiveOrLatestSerial } from "@/lib/serial-lifecycle";

export { SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD } from "@/lib/simple-project-dispatch";

export type SimpleDispatchSerialInput = {
  serialId: string;
  productId: string;
};

function serializeProjectDispatch(dispatch: ProjectDispatchRecord) {
  return {
    id: dispatch.id,
    dispatchNo: dispatch.dispatchNo,
    status: dispatch.status,
    vehicleNo: dispatch.vehicleNo,
    receiverName: dispatch.receiverName,
    receiverMobile: dispatch.receiverMobile,
    signatureData: dispatch.signatureData,
    remarks: dispatch.remarks,
    dispatchedAt: dispatch.dispatchedAt?.toISOString() ?? null,
    createdAt: dispatch.createdAt.toISOString(),
    project: dispatch.project,
    warehouse: dispatch.warehouse,
    createdBy: dispatch.createdBy,
    company: dispatch.company,
    lines: dispatch.lines.map((line) => ({
      id: line.id,
      materialLineId: line.materialLineId,
      qty: decimalToNumber(line.qty),
      kitProductId: line.kitProductId,
      kitProductName: line.kitProductName,
      kitBomQty: line.kitBomQty != null ? decimalToNumber(line.kitBomQty) : null,
      product: line.product,
      serials: line.serials.map((entry) => ({
        id: entry.serial.id,
        serialNumber: entry.serial.serialNumber,
      })),
    })),
    heading: `Projects Dispatch - ${dispatch.project.projectNo} - ${dispatch.project.customerName}`,
    serialCount: dispatch.lines.reduce((sum, line) => sum + line.serials.length, 0),
    requiresApproval:
      dispatch.lines.reduce((sum, line) => sum + line.serials.length, 0) >
      SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD,
  };
}

function normalizeProjectNo(projectNo: string): string {
  return projectNo.trim().replace(/\s+/g, " ");
}

export async function findProjectByProjectNo(
  prisma: PrismaClient,
  companyId: string,
  projectNo: string,
) {
  const normalized = normalizeProjectNo(projectNo);
  if (!normalized) throw new Error("PROJECT_NO_REQUIRED");

  const project = await prisma.project.findFirst({
    where: {
      companyId,
      projectNo: { equals: normalized, mode: "insensitive" },
    },
    select: {
      id: true,
      projectNo: true,
      customerName: true,
      customerMobile: true,
      siteAddress: true,
      status: true,
      warehouseId: true,
      proposal: { select: { proposalNo: true } },
    },
  });

  return project;
}

export async function createMinimalProject(
  prisma: PrismaClient,
  input: {
    companyId: string;
    companyCode: string;
    projectNo: string;
    customerName: string;
    createdById: string;
  },
) {
  assertProjectsCompany({ code: input.companyCode });

  const projectNo = normalizeProjectNo(input.projectNo);
  const customerName = input.customerName.trim();
  if (!projectNo) throw new Error("PROJECT_NO_REQUIRED");
  if (!customerName) throw new Error("CUSTOMER_NAME_REQUIRED");

  const existing = await findProjectByProjectNo(prisma, input.companyId, projectNo);
  if (existing) throw new Error("PROJECT_NO_EXISTS");

  const warehouse = await findJalgaonProjectsWarehouse(prisma, input.companyId);

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        projectNo,
        companyId: input.companyId,
        proposalId: null,
        revisionId: null,
        warehouseId: warehouse.id,
        customerName,
        customerMobile: "",
        siteAddress: "",
        status: ProjectStatus.OPEN,
        createdById: input.createdById,
        updatedById: input.createdById,
        assignment: { create: {} },
      },
      select: {
        id: true,
        projectNo: true,
        customerName: true,
        customerMobile: true,
        siteAddress: true,
        status: true,
        warehouseId: true,
        proposal: { select: { proposalNo: true } },
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "projects",
      recordId: project.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: { projectNo, customerName, channel: "SIMPLE_PROJECT_DISPATCH" },
      reference: projectNo,
    });

    return project;
  });
}

async function describeUnavailableSerial(
  prisma: PrismaClient,
  serial: { id: string; status: SerialStatus },
): Promise<string> {
  if (serial.status === SerialStatus.DISPATCHED) {
    const projectRow = await prisma.projectDispatchLineSerial.findFirst({
      where: {
        serialId: serial.id,
        dispatchLine: {
          dispatch: { status: { not: ProjectDispatchStatus.CANCELLED } },
        },
      },
      select: {
        dispatchLine: {
          select: {
            dispatch: {
              select: {
                dispatchNo: true,
                project: { select: { projectNo: true, customerName: true } },
              },
            },
          },
        },
      },
    });
    if (projectRow) {
      const d = projectRow.dispatchLine.dispatch;
      return `Already dispatched on ${d.dispatchNo} to project ${d.project.projectNo} (${d.project.customerName}).`;
    }
    return "Already dispatched out of stock.";
  }
  if (serial.status === SerialStatus.BOOKED) {
    return "Booked against a sales order.";
  }
  if (serial.status === SerialStatus.DAMAGED) {
    return "Marked damaged and removed from sellable stock.";
  }
  if (serial.status === SerialStatus.DAMAGE_PENDING) {
    return "A damage report is pending approval for this serial.";
  }
  if (serial.status === SerialStatus.REMOVED) {
    return "Removed from stock.";
  }
  return `Not available (status ${serial.status}).`;
}

/** Mixed paste lookup — any warehouse/company; duplicates auto-dropped with warning. */
export async function lookupSerialsForSimpleProjectDispatch(
  prisma: PrismaClient,
  input: { companyId: string; projectId: string; serialNumbers: string[] },
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
    select: { id: true },
  });
  if (!project) throw new Error("NOT_FOUND");

  const valid: Array<{
    id: string;
    serialNumber: string;
    product: { id: string; displayName: string; serialTracking: boolean };
    warehouse: { id: string; name: string } | null;
  }> = [];
  const invalid: Array<{ serialNumber: string; reason: string }> = [];
  const duplicatesRemoved: string[] = [];
  const seen = new Set<string>();

  for (const serialNumber of await resolveStoredSerials(prisma, input.serialNumbers)) {
    if (seen.has(serialNumber)) {
      duplicatesRemoved.push(serialNumber);
      continue;
    }
    seen.add(serialNumber);

    const serial = await findLiveOrLatestSerial(prisma, serialNumber, {
      product: {
        select: { id: true, displayName: true, serialTracking: true },
      },
      currentWarehouse: { select: { id: true, name: true } },
    });

    if (!serial) {
      invalid.push({ serialNumber, reason: "Serial not found in the system." });
      continue;
    }

    if (!serial.product.serialTracking) {
      invalid.push({
        serialNumber,
        reason: "Product is not serial-tracked. Simple Project Dispatch supports serials only.",
      });
      continue;
    }

    if (serial.status !== SerialStatus.AVAILABLE) {
      invalid.push({
        serialNumber,
        reason: await describeUnavailableSerial(prisma, serial),
      });
      continue;
    }

    valid.push({
      id: serial.id,
      serialNumber: serial.serialNumber,
      product: serial.product,
      warehouse: serial.currentWarehouse,
    });
  }

  const grouped = new Map<
    string,
    {
      productId: string;
      productName: string;
      qty: number;
      serials: Array<{ id: string; serialNumber: string; warehouseName: string | null }>;
    }
  >();

  for (const row of valid) {
    const existing = grouped.get(row.product.id);
    const entry = {
      id: row.id,
      serialNumber: row.serialNumber,
      warehouseName: row.warehouse?.name ?? null,
    };
    if (existing) {
      existing.qty += 1;
      existing.serials.push(entry);
    } else {
      grouped.set(row.product.id, {
        productId: row.product.id,
        productName: row.product.displayName,
        qty: 1,
        serials: [entry],
      });
    }
  }

  return {
    valid,
    invalid,
    duplicatesRemoved,
    groups: [...grouped.values()],
  };
}

function groupSerialInputsByProduct(
  serials: SimpleDispatchSerialInput[],
): Array<{ productId: string; serialIds: string[]; qty: number }> {
  const map = new Map<string, string[]>();
  for (const row of serials) {
    const list = map.get(row.productId) ?? [];
    list.push(row.serialId);
    map.set(row.productId, list);
  }
  return [...map.entries()].map(([productId, serialIds]) => ({
    productId,
    serialIds,
    qty: serialIds.length,
  }));
}

async function validateSimpleSerialSelection(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: { companyId: string; serials: SimpleDispatchSerialInput[] },
) {
  if (input.serials.length === 0) throw new Error("LINES_REQUIRED");

  const serialIds = input.serials.map((row) => row.serialId);
  if (new Set(serialIds).size !== serialIds.length) {
    throw new Error("INVALID_SERIAL_SELECTION");
  }

  const rows = await prisma.inventorySerial.findMany({
    where: { id: { in: serialIds } },
    include: {
      product: { select: { id: true, serialTracking: true, displayName: true } },
    },
  });
  if (rows.length !== serialIds.length) throw new Error("INVALID_SERIAL_SELECTION");

  for (const expected of input.serials) {
    const row = rows.find((serial) => serial.id === expected.serialId);
    if (!row) throw new Error("INVALID_SERIAL_SELECTION");
    if (row.productId !== expected.productId) throw new Error("INVALID_SERIAL_SELECTION");
    if (!row.product.serialTracking) throw new Error("SERIAL_REQUIRED");
    if (row.status !== SerialStatus.AVAILABLE) throw new Error("INVALID_SERIAL_SELECTION");
  }

  return rows;
}

export async function createSimpleProjectDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    createdById: string;
    receiverName?: string;
    remarks?: string;
    serials: SimpleDispatchSerialInput[];
  },
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
    include: { company: true },
  });
  if (!project) throw new Error("NOT_FOUND");
  assertProjectsCompany(project.company);
  if (project.status === ProjectStatus.CLOSED) throw new Error("PROJECT_CLOSED");

  await validateSimpleSerialSelection(prisma, {
    companyId: input.companyId,
    serials: input.serials,
  });

  const lineGroups = groupSerialInputsByProduct(input.serials);
  const dispatchNo = await generateProjectDispatchNumber(
    prisma,
    project.company.code,
    input.companyId,
  );

  return prisma.$transaction(
    async (tx) => {
      const dispatch = await tx.projectDispatch.create({
        data: {
          dispatchNo,
          projectId: project.id,
          companyId: input.companyId,
          warehouseId: project.warehouseId,
          status: ProjectDispatchStatus.DRAFT,
          receiverName: input.receiverName?.trim() || null,
          remarks: input.remarks,
          createdById: input.createdById,
          lines: {
            create: lineGroups.map((group, index) => ({
              materialLineId: null,
              productId: group.productId,
              qty: group.qty,
              sortOrder: index,
              serials: {
                create: group.serialIds.map((serialId) => ({ serialId })),
              },
            })),
          },
        },
        include: projectDispatchInclude,
      });

      await writeAuditLogTx(tx, {
        tableName: "project_dispatches",
        recordId: dispatch.id,
        action: "CREATE",
        newValue: {
          dispatchNo: dispatch.dispatchNo,
          status: dispatch.status,
          channel: "SIMPLE",
          serialCount: input.serials.length,
        },
        performedBy: input.createdById,
        companyId: input.companyId,
        reference: dispatch.dispatchNo,
      });

      return serializeProjectDispatch(dispatch);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function updateSimpleProjectDispatchDraft(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    performedById: string;
    receiverName?: string;
    remarks?: string;
    serials: SimpleDispatchSerialInput[];
  },
) {
  const existing = await prisma.projectDispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: { project: { include: { company: true } } },
  });
  if (!existing) throw new Error("NOT_FOUND");
  assertProjectsCompany(existing.project.company);
  if (
    existing.status !== ProjectDispatchStatus.DRAFT &&
    existing.status !== ProjectDispatchStatus.PENDING_APPROVAL
  ) {
    throw new Error("INVALID_STATUS");
  }
  if (existing.project.status === ProjectStatus.CLOSED) throw new Error("PROJECT_CLOSED");

  await validateSimpleSerialSelection(prisma, {
    companyId: input.companyId,
    serials: input.serials,
  });

  const lineGroups = groupSerialInputsByProduct(input.serials);

  return prisma.$transaction(
    async (tx) => {
      await tx.projectDispatchLine.deleteMany({ where: { dispatchId: existing.id } });

      const dispatch = await tx.projectDispatch.update({
        where: { id: existing.id },
        data: {
          status: ProjectDispatchStatus.DRAFT,
          receiverName: input.receiverName?.trim() || null,
          remarks: input.remarks,
          lines: {
            create: lineGroups.map((group, index) => ({
              materialLineId: null,
              productId: group.productId,
              qty: group.qty,
              sortOrder: index,
              serials: {
                create: group.serialIds.map((serialId) => ({ serialId })),
              },
            })),
          },
        },
        include: projectDispatchInclude,
      });

      await writeAuditLogTx(tx, {
        tableName: "project_dispatches",
        recordId: dispatch.id,
        action: "UPDATE",
        oldValue: { status: existing.status },
        newValue: {
          status: dispatch.status,
          serialCount: input.serials.length,
          channel: "SIMPLE",
        },
        performedBy: input.performedById,
        companyId: input.companyId,
        reference: dispatch.dispatchNo,
      });

      return serializeProjectDispatch(dispatch);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

function countDispatchSerials(dispatch: {
  lines: Array<{ serials: unknown[] }>;
}): number {
  return dispatch.lines.reduce((sum, line) => sum + line.serials.length, 0);
}

/** Warehouse (or anyone preparing): move large draft to pending approval. */
export async function submitSimpleProjectDispatchForApproval(
  prisma: PrismaClient,
  input: { companyId: string; dispatchId: string; performedById: string },
) {
  const dispatch = await prisma.projectDispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: {
      project: { include: { company: true } },
      lines: { include: { serials: true } },
    },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  assertProjectsCompany(dispatch.project.company);
  if (dispatch.status !== ProjectDispatchStatus.DRAFT) throw new Error("INVALID_STATUS");
  if (dispatch.project.status === ProjectStatus.CLOSED) throw new Error("PROJECT_CLOSED");

  const serialCount = countDispatchSerials(dispatch);
  if (serialCount === 0) throw new Error("LINES_REQUIRED");
  if (serialCount <= SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD) {
    throw new Error("APPROVAL_NOT_REQUIRED");
  }
  if (!dispatch.receiverName?.trim()) {
    throw new Error("RECEIVER_NAME_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.projectDispatch.update({
      where: { id: dispatch.id },
      data: { status: ProjectDispatchStatus.PENDING_APPROVAL },
      include: projectDispatchInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "project_dispatches",
      recordId: dispatch.id,
      action: "UPDATE",
      oldValue: { status: ProjectDispatchStatus.DRAFT },
      newValue: { status: ProjectDispatchStatus.PENDING_APPROVAL, serialCount },
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: dispatch.dispatchNo,
    });

    return serializeProjectDispatch(updated);
  });
}

async function confirmSimpleProjectDispatchTx(
  tx: Prisma.TransactionClient,
  input: { companyId: string; dispatchId: string; performedById: string },
) {
  const dispatch = await tx.projectDispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: {
      project: { include: { company: true } },
      lines: {
        include: {
          product: true,
          serials: true,
        },
      },
    },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  assertProjectsCompany(dispatch.project.company);
  if (dispatch.project.status === ProjectStatus.CLOSED) throw new Error("PROJECT_CLOSED");
  if (!dispatch.receiverName?.trim()) throw new Error("RECEIVER_NAME_REQUIRED");
  if (dispatch.lines.length === 0) throw new Error("LINES_REQUIRED");

  const serialCount = countDispatchSerials(dispatch);
  if (serialCount === 0) throw new Error("LINES_REQUIRED");

  // PM/SA may confirm from DRAFT (including large DCs = approve+confirm) or PENDING_APPROVAL.
  if (
    dispatch.status !== ProjectDispatchStatus.DRAFT &&
    dispatch.status !== ProjectDispatchStatus.PENDING_APPROVAL
  ) {
    throw new Error("INVALID_STATUS");
  }

  for (const line of dispatch.lines) {
    if (!line.product.serialTracking) throw new Error("SERIAL_REQUIRED");
    const qty = decimalToNumber(line.qty);
    if (line.serials.length !== qty) throw new Error("SERIAL_REQUIRED");

    await executeProjectDispatchStockMove(tx, {
      projectCompanyId: input.companyId,
      projectsWarehouseId: dispatch.warehouseId,
      productId: line.productId,
      serialTracking: true,
      qty,
      serialIds: line.serials.map((entry) => entry.serialId),
      stockSourceLog: null,
      performedById: input.performedById,
      referenceNote: `Simple project dispatch staging for ${dispatch.dispatchNo}`,
      allowAnySourceWarehouse: true,
    });

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.DISPATCH,
        companyId: input.companyId,
        productId: line.productId,
        qty,
        fromWarehouseId: dispatch.warehouseId,
        referenceType: "PROJECT_DISPATCH",
        referenceId: dispatch.id,
        notes: `Project dispatch on ${dispatch.dispatchNo}`,
        createdById: input.performedById,
      },
    });

    await tx.inventoryEvent.create({
      data: {
        companyId: input.companyId,
        warehouseId: dispatch.warehouseId,
        productId: line.productId,
        eventType: InventoryEventType.ACTUAL_DISPATCH,
        quantity: qty,
        quantityEffect: toSignedInventoryQuantity(InventoryEventType.ACTUAL_DISPATCH, qty),
        effectiveDate: new Date(),
        sourceType: "PROJECT_DISPATCH",
        sourceId: dispatch.id,
        sourceNumber: dispatch.dispatchNo,
        status: InventoryEventStatus.COMPLETED,
        createdById: input.performedById,
      },
    });
  }

  const nextProjectStatus =
    dispatch.project.status === ProjectStatus.OPEN ||
    dispatch.project.status === ProjectStatus.MATERIAL_DRAFT ||
    dispatch.project.status === ProjectStatus.MATERIAL_PENDING_APPROVAL ||
    dispatch.project.status === ProjectStatus.MATERIAL_ASSIGNED ||
    dispatch.project.status === ProjectStatus.READY_FOR_DISPATCH
      ? ProjectStatus.PARTIALLY_DISPATCHED
      : dispatch.project.status === ProjectStatus.FULLY_DISPATCHED
        ? ProjectStatus.FULLY_DISPATCHED
        : ProjectStatus.PARTIALLY_DISPATCHED;

  await tx.project.update({
    where: { id: dispatch.projectId },
    data: {
      status: nextProjectStatus,
      updatedById: input.performedById,
    },
  });

  const updated = await tx.projectDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: ProjectDispatchStatus.DISPATCHED,
      dispatchedAt: new Date(),
    },
    include: projectDispatchInclude,
  });

  await writeAuditLogTx(tx, {
    tableName: "project_dispatches",
    recordId: dispatch.id,
    action: "UPDATE",
    oldValue: { status: dispatch.status },
    newValue: { status: ProjectDispatchStatus.DISPATCHED, channel: "SIMPLE" },
    performedBy: input.performedById,
    companyId: input.companyId,
    reference: dispatch.dispatchNo,
  });

  return serializeProjectDispatch(updated);
}

export async function confirmSimpleProjectDispatch(
  prisma: PrismaClient,
  input: { companyId: string; dispatchId: string; performedById: string },
) {
  return prisma.$transaction((tx) => confirmSimpleProjectDispatchTx(tx, input), {
    maxWait: 10_000,
    timeout: 60_000,
  });
}

/** Cancel dispatched (or draft) PDC and restock serials at Projects WH. PM/SA only. */
export async function cancelSimpleProjectDispatch(
  prisma: PrismaClient,
  input: { companyId: string; dispatchId: string; performedById: string },
) {
  return prisma.$transaction(
    async (tx) => {
      const dispatch = await tx.projectDispatch.findFirst({
        where: { id: input.dispatchId, companyId: input.companyId },
        include: {
          project: { include: { company: true } },
          warehouse: true,
          lines: {
            include: {
              product: { select: { id: true, serialTracking: true, displayName: true } },
              serials: {
                include: {
                  serial: {
                    select: {
                      id: true,
                      serialNumber: true,
                      status: true,
                      currentWarehouseId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!dispatch) throw new Error("NOT_FOUND");
      assertProjectsCompany(dispatch.project.company);

      if (dispatch.status === ProjectDispatchStatus.CANCELLED) {
        throw new Error("INVALID_STATUS");
      }

      if (
        dispatch.status === ProjectDispatchStatus.DRAFT ||
        dispatch.status === ProjectDispatchStatus.PENDING_APPROVAL
      ) {
        const updated = await tx.projectDispatch.update({
          where: { id: dispatch.id },
          data: { status: ProjectDispatchStatus.CANCELLED },
          include: projectDispatchInclude,
        });
        await writeAuditLogTx(tx, {
          tableName: "project_dispatches",
          recordId: dispatch.id,
          action: "UPDATE",
          oldValue: { status: dispatch.status },
          newValue: { status: ProjectDispatchStatus.CANCELLED },
          performedBy: input.performedById,
          companyId: input.companyId,
          reference: dispatch.dispatchNo,
        });
        return serializeProjectDispatch(updated);
      }

      if (dispatch.status !== ProjectDispatchStatus.DISPATCHED) {
        throw new Error("INVALID_STATUS");
      }

      const serialIdsToRelease: string[] = [];
      for (const line of dispatch.lines) {
        if (!line.product.serialTracking) throw new Error("CANCEL_NON_SERIAL_UNSUPPORTED");
        for (const row of line.serials) {
          const serial = row.serial;
          if (serial.status !== SerialStatus.DISPATCHED) {
            throw new Error("CANCEL_STOCK_MOVED");
          }
          if (serial.currentWarehouseId !== dispatch.warehouseId) {
            throw new Error("CANCEL_STOCK_MOVED");
          }
          serialIdsToRelease.push(serial.id);
        }
      }

      if (serialIdsToRelease.length > 0) {
        await tx.inventorySerial.updateMany({
          where: { id: { in: serialIdsToRelease } },
          data: { status: SerialStatus.AVAILABLE },
        });
      }

      await tx.inventoryTransaction.deleteMany({
        where: { referenceType: "PROJECT_DISPATCH", referenceId: dispatch.id },
      });

      await tx.inventoryEvent.updateMany({
        where: {
          sourceType: "PROJECT_DISPATCH",
          sourceId: dispatch.id,
          status: { not: InventoryEventStatus.CANCELLED },
        },
        data: { status: InventoryEventStatus.CANCELLED },
      });

      const updated = await tx.projectDispatch.update({
        where: { id: dispatch.id },
        data: { status: ProjectDispatchStatus.CANCELLED },
        include: projectDispatchInclude,
      });

      await writeAuditLogTx(tx, {
        tableName: "project_dispatches",
        recordId: dispatch.id,
        action: "UPDATE",
        oldValue: { status: ProjectDispatchStatus.DISPATCHED },
        newValue: {
          status: ProjectDispatchStatus.CANCELLED,
          restockedSerials: serialIdsToRelease.length,
        },
        performedBy: input.performedById,
        companyId: input.companyId,
        reference: dispatch.dispatchNo,
      });

      return serializeProjectDispatch(updated);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function getSimpleProjectDispatch(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
) {
  const dispatch = await prisma.projectDispatch.findFirst({
    where: { id: dispatchId, companyId },
    include: projectDispatchInclude,
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  return serializeProjectDispatch(dispatch);
}

export async function listSimpleProjectDispatches(
  prisma: PrismaClient,
  companyId: string,
  filters?: { projectId?: string; q?: string },
) {
  const where: Prisma.ProjectDispatchWhereInput = { companyId };
  if (filters?.projectId) where.projectId = filters.projectId;
  if (filters?.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { dispatchNo: { contains: q, mode: "insensitive" } },
      { project: { projectNo: { contains: q, mode: "insensitive" } } },
      { project: { customerName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rows = await prisma.projectDispatch.findMany({
    where,
    include: projectDispatchInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return rows.map(serializeProjectDispatch);
}
