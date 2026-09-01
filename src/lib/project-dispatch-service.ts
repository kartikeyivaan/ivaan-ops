import {
  InventoryEventStatus,
  InventoryEventType,
  InventoryTransactionType,
  ProjectDispatchStatus,
  ProjectMaterialLineStatus,
  ProjectStatus,
  Prisma,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { assertProjectsCompany } from "@/lib/company-scope";
import { decimalToNumber, normalizeSerialNumber } from "@/lib/inventory";
import { toSignedInventoryQuantity } from "@/lib/inventory-events";
import { getRemainingQty } from "@/lib/dispatches";
import {
  componentRemainingQty,
  isKitProduct,
  loadKitBomMap,
  resolveKitDispatchQty,
} from "@/lib/kit-fulfillment";
import { getKitComponentsForFulfillment } from "@/lib/product-service";
import { generateProjectDispatchNumber } from "@/lib/projects";
import {
  buildProjectDispatchSourceWarehouseIds,
  executeProjectDispatchStockMove,
  listHoWarehousePools,
} from "@/lib/project-stock-service";

export const DISPATCHABLE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.MATERIAL_ASSIGNED,
  ProjectStatus.READY_FOR_DISPATCH,
  ProjectStatus.PARTIALLY_DISPATCHED,
];

export const projectDispatchInclude = {
  project: {
    select: {
      id: true,
      projectNo: true,
      customerName: true,
      customerMobile: true,
      siteAddress: true,
      status: true,
      proposal: { select: { proposalNo: true } },
    },
  },
  warehouse: { select: { id: true, name: true, code: true } },
  company: {
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
      tagline: true,
      bankDetails: true,
      termsAndConditions: true,
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
          hsn: true,
        },
      },
      materialLine: {
        select: {
          id: true,
          requiredQty: true,
          assignedQty: true,
          dispatchedQty: true,
        },
      },
      serials: {
        include: {
          serial: { select: { id: true, serialNumber: true } },
        },
      },
    },
  },
} satisfies Prisma.ProjectDispatchInclude;

export type ProjectDispatchRecord = Prisma.ProjectDispatchGetPayload<{
  include: typeof projectDispatchInclude;
}>;

export type ProjectDispatchLineInput = {
  materialLineId: string;
  productId: string;
  qty: number;
  serialIds?: string[];
  kitProductId?: string;
  kitProductName?: string;
  kitBomQty?: number;
};

export type DispatchableProjectLine = {
  materialLineId: string;
  productId: string;
  productName: string;
  serialTracking: boolean;
  assignedQty: number;
  dispatchedQty: number;
  remainingQty: number;
  isKitComponent: boolean;
  kitProductId?: string;
  kitProductName?: string;
  kitBomQty?: number;
};

export type DispatchableProject = {
  id: string;
  projectNo: string;
  proposalNo: string;
  customerName: string;
  siteAddress: string;
  status: ProjectStatus;
  readyLineCount: number;
  lines: DispatchableProjectLine[];
  draft?: {
    vehicleNo: string | null;
    receiverName: string | null;
    receiverMobile: string | null;
    remarks: string | null;
  };
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
  };
}

function resolveLineStatusAfterDispatch(
  dispatchedQty: number,
  requiredQty: number,
  assignedQty: number,
): ProjectMaterialLineStatus {
  if (dispatchedQty >= requiredQty) return ProjectMaterialLineStatus.FULLY_DISPATCHED;
  if (dispatchedQty > 0) return ProjectMaterialLineStatus.PARTIALLY_DISPATCHED;
  if (assignedQty >= requiredQty) return ProjectMaterialLineStatus.ASSIGNED;
  if (assignedQty > 0) return ProjectMaterialLineStatus.PENDING_STOCK;
  return ProjectMaterialLineStatus.PENDING_STOCK;
}

function resolveProjectStatusAfterDispatch(
  lines: Array<{ requiredQty: number; assignedQty: number; dispatchedQty: number }>,
): ProjectStatus {
  const allFullyDispatched = lines.every((line) => line.dispatchedQty >= line.requiredQty);
  const anyDispatched = lines.some((line) => line.dispatchedQty > 0);
  const anyDispatchable = lines.some((line) => line.assignedQty > line.dispatchedQty);

  if (allFullyDispatched) return ProjectStatus.FULLY_DISPATCHED;
  if (anyDispatched) return ProjectStatus.PARTIALLY_DISPATCHED;
  if (anyDispatchable) return ProjectStatus.READY_FOR_DISPATCH;
  return ProjectStatus.MATERIAL_ASSIGNED;
}

async function buildDispatchableLines(
  prisma: PrismaClient | Prisma.TransactionClient,
  materialLines: Array<{
    id: string;
    productId: string;
    assignedQty: Prisma.Decimal;
    dispatchedQty: Prisma.Decimal;
    product: {
      id: string;
      displayName: string;
      serialTracking: boolean;
      category: { name: string };
    };
  }>,
): Promise<DispatchableProjectLine[]> {
  const items: DispatchableProjectLine[] = [];

  for (const line of materialLines) {
    const assignedQty = decimalToNumber(line.assignedQty);
    const dispatchedQty = decimalToNumber(line.dispatchedQty);
    const remainingKits = getRemainingQty(assignedQty, dispatchedQty);
    if (remainingKits <= 0) continue;

    if (isKitProduct(line.product)) {
      const components = await getKitComponentsForFulfillment(prisma, line.productId);
      for (const component of components) {
        items.push({
          materialLineId: line.id,
          productId: component.componentProductId,
          productName: `${component.displayName} (from ${line.product.displayName})`,
          serialTracking: component.serialTracking,
          assignedQty: assignedQty * component.qty,
          dispatchedQty: dispatchedQty * component.qty,
          remainingQty: componentRemainingQty(remainingKits, component.qty),
          isKitComponent: true,
          kitProductId: line.productId,
          kitProductName: line.product.displayName,
          kitBomQty: component.qty,
        });
      }
    } else {
      items.push({
        materialLineId: line.id,
        productId: line.productId,
        productName: line.product.displayName,
        serialTracking: line.product.serialTracking,
        assignedQty,
        dispatchedQty,
        remainingQty: remainingKits,
        isKitComponent: false,
      });
    }
  }

  return items;
}

export async function listDispatchableProjects(
  prisma: PrismaClient,
  companyId: string,
  filters?: { q?: string },
) {
  const needle = filters?.q?.trim();
  const projects = await prisma.project.findMany({
    where: {
      companyId,
      status: { in: DISPATCHABLE_PROJECT_STATUSES },
      assignment: { isNot: null },
      ...(needle
        ? {
            OR: [
              { projectNo: { contains: needle, mode: "insensitive" } },
              { customerName: { contains: needle, mode: "insensitive" } },
              { siteAddress: { contains: needle, mode: "insensitive" } },
              { proposal: { proposalNo: { contains: needle, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      proposal: { select: { proposalNo: true } },
      assignment: {
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
            include: {
              product: {
                select: {
                  id: true,
                  displayName: true,
                  serialTracking: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      dispatches: {
        where: { status: ProjectDispatchStatus.DRAFT },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          vehicleNo: true,
          receiverName: true,
          receiverMobile: true,
          remarks: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result: DispatchableProject[] = [];

  for (const project of projects) {
    const lines = await buildDispatchableLines(prisma, project.assignment!.lines);
    if (lines.length === 0) continue;

    result.push({
      id: project.id,
      projectNo: project.projectNo,
      proposalNo: project.proposal.proposalNo,
      customerName: project.customerName,
      siteAddress: project.siteAddress,
      status: project.status,
      readyLineCount: lines.length,
      lines,
      draft: project.dispatches[0]
        ? {
            vehicleNo: project.dispatches[0].vehicleNo,
            receiverName: project.dispatches[0].receiverName,
            receiverMobile: project.dispatches[0].receiverMobile,
            remarks: project.dispatches[0].remarks,
          }
        : undefined,
    });
  }

  return result;
}

export async function getDispatchableProject(
  prisma: PrismaClient,
  companyId: string,
  projectId: string,
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      companyId,
      status: { in: DISPATCHABLE_PROJECT_STATUSES },
    },
    include: {
      proposal: { select: { proposalNo: true } },
      assignment: {
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
            include: {
              product: {
                select: {
                  id: true,
                  displayName: true,
                  serialTracking: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      dispatches: {
        where: { status: ProjectDispatchStatus.DRAFT },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          vehicleNo: true,
          receiverName: true,
          receiverMobile: true,
          remarks: true,
        },
      },
    },
  });

  if (!project?.assignment) return null;

  const lines = await buildDispatchableLines(prisma, project.assignment.lines);
  if (lines.length === 0) return null;

  return {
    id: project.id,
    projectNo: project.projectNo,
    proposalNo: project.proposal.proposalNo,
    customerName: project.customerName,
    siteAddress: project.siteAddress,
    status: project.status,
    readyLineCount: lines.length,
    lines,
    draft: project.dispatches[0]
      ? {
          vehicleNo: project.dispatches[0].vehicleNo,
          receiverName: project.dispatches[0].receiverName,
          receiverMobile: project.dispatches[0].receiverMobile,
          remarks: project.dispatches[0].remarks,
        }
      : undefined,
  } satisfies DispatchableProject;
}

export async function listProjectDispatches(
  prisma: PrismaClient,
  companyId: string,
  filters?: { projectId?: string; q?: string; status?: ProjectDispatchStatus },
) {
  const rows = await prisma.projectDispatch.findMany({
    where: {
      companyId,
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.q
        ? {
            OR: [
              { dispatchNo: { contains: filters.q, mode: "insensitive" } },
              { project: { projectNo: { contains: filters.q, mode: "insensitive" } } },
              { project: { customerName: { contains: filters.q, mode: "insensitive" } } },
              { project: { proposal: { proposalNo: { contains: filters.q, mode: "insensitive" } } } },
              { vehicleNo: { contains: filters.q, mode: "insensitive" } },
              { receiverName: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: projectDispatchInclude,
    orderBy: [{ createdAt: "desc" }],
  });

  return rows.map(serializeProjectDispatch);
}

export async function getProjectDispatchById(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
) {
  const dispatch = await prisma.projectDispatch.findFirst({
    where: { id: dispatchId, companyId },
    include: projectDispatchInclude,
  });
  if (!dispatch) return null;
  return serializeProjectDispatch(dispatch);
}

export async function getProjectDispatchRecord(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
): Promise<ProjectDispatchRecord | null> {
  return prisma.projectDispatch.findFirst({
    where: { id: dispatchId, companyId },
    include: projectDispatchInclude,
  });
}

async function validateProjectDispatchLines(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    warehouseId: string;
    lines: ProjectDispatchLineInput[];
  },
) {
  if (input.lines.length === 0) throw new Error("LINES_REQUIRED");
  if (!input.lines.some((line) => line.qty > 0)) throw new Error("LINES_REQUIRED");

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
    include: {
      assignment: {
        include: {
          lines: {
            include: {
              product: { include: { category: true } },
            },
          },
        },
      },
    },
  });
  if (!project?.assignment) throw new Error("NOT_FOUND");
  if (project.status === ProjectStatus.CLOSED) throw new Error("PROJECT_CLOSED");

  const materialLineMap = new Map(
    project.assignment.lines.map((line) => [line.id, line]),
  );

  const kitProductIds = project.assignment.lines
    .filter((line) => isKitProduct(line.product))
    .map((line) => line.productId);
  const kitBomMap = await loadKitBomMap(prisma, kitProductIds);

  const linesByMaterial = new Map<string, ProjectDispatchLineInput[]>();
  for (const line of input.lines.filter((row) => row.qty > 0)) {
    const materialLine = materialLineMap.get(line.materialLineId);
    if (!materialLine) throw new Error("INVALID_LINE");

    const assignedQty = decimalToNumber(materialLine.assignedQty);
    const dispatchedQty = decimalToNumber(materialLine.dispatchedQty);
    const balance = getRemainingQty(assignedQty, dispatchedQty);

    if (isKitProduct(materialLine.product)) {
      const bom = kitBomMap.get(materialLine.productId) ?? [];
      if (!bom.some((component) => component.componentProductId === line.productId)) {
        throw new Error("INVALID_LINE");
      }
      const componentBalance = componentRemainingQty(balance, line.kitBomQty ?? 1);
      if (line.qty > componentBalance) throw new Error("EXCEEDS_REMAINING_QTY");
    } else {
      if (line.productId !== materialLine.productId) throw new Error("INVALID_LINE");
      if (line.qty > balance) throw new Error("EXCEEDS_REMAINING_QTY");
    }

    if (materialLine.product.serialTracking && !isKitProduct(materialLine.product)) {
      if (!line.serialIds?.length || line.serialIds.length !== line.qty) {
        throw new Error("SERIAL_REQUIRED");
      }
    } else {
      const product = await prisma.product.findUnique({
        where: { id: line.productId },
        select: { serialTracking: true },
      });
      if (product?.serialTracking) {
        if (!line.serialIds?.length || line.serialIds.length !== line.qty) {
          throw new Error("SERIAL_REQUIRED");
        }
      }
    }

    const group = linesByMaterial.get(line.materialLineId) ?? [];
    group.push(line);
    linesByMaterial.set(line.materialLineId, group);
  }

  for (const [materialLineId, groupLines] of linesByMaterial) {
    const materialLine = materialLineMap.get(materialLineId)!;
    if (!isKitProduct(materialLine.product)) continue;

    const bom = kitBomMap.get(materialLine.productId) ?? [];
    if (bom.length === 0) throw new Error("KIT_BOM_EMPTY");

    resolveKitDispatchQty({
      kitOrderedQty: decimalToNumber(materialLine.assignedQty),
      kitDispatchedQty: decimalToNumber(materialLine.dispatchedQty),
      bom,
      lines: groupLines.map((line) => ({ productId: line.productId, qty: line.qty })),
    });
  }

  const allSerialIds = input.lines.flatMap((line) => line.serialIds ?? []);
  if (allSerialIds.length > 0) {
    const uniqueIds = [...new Set(allSerialIds)];
    if (uniqueIds.length !== allSerialIds.length) throw new Error("INVALID_SERIAL_SELECTION");

    const hoPools = await listHoWarehousePools(prisma, input.companyId);
    const sourceWarehouseIds = buildProjectDispatchSourceWarehouseIds(
      input.warehouseId,
      hoPools.map((pool) => pool.warehouseId),
    );

    const selectable = await prisma.inventorySerial.findMany({
      where: {
        id: { in: uniqueIds },
        currentWarehouseId: { in: sourceWarehouseIds },
        status: SerialStatus.AVAILABLE,
      },
      include: { product: { select: { id: true, serialTracking: true } } },
    });
    if (selectable.length !== uniqueIds.length) throw new Error("INVALID_SERIAL_SELECTION");

    for (const line of input.lines) {
      if (!line.serialIds?.length) continue;
      const wrong = selectable.some(
        (serial) =>
          line.serialIds!.includes(serial.id) && serial.productId !== line.productId,
      );
      if (wrong) throw new Error("INVALID_SERIAL_SELECTION");
    }
  }

  return project;
}

export async function createProjectDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    createdById: string;
    vehicleNo?: string;
    receiverName?: string;
    receiverMobile?: string;
    signatureData?: string;
    remarks?: string;
    confirm: boolean;
    lines: ProjectDispatchLineInput[];
  },
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
    include: { company: true },
  });
  if (!project) throw new Error("NOT_FOUND");
  assertProjectsCompany(project.company);
  if (project.status === ProjectStatus.CLOSED) throw new Error("PROJECT_CLOSED");

  await validateProjectDispatchLines(prisma, {
    companyId: input.companyId,
    projectId: project.id,
    warehouseId: project.warehouseId,
    lines: input.lines,
  });

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
          vehicleNo: input.vehicleNo,
          receiverName: input.receiverName,
          receiverMobile: input.receiverMobile,
          signatureData: input.signatureData,
          remarks: input.remarks,
          createdById: input.createdById,
          lines: {
            create: input.lines
              .filter((line) => line.qty > 0)
              .map((line, index) => ({
                materialLineId: line.materialLineId,
                productId: line.productId,
                qty: line.qty,
                kitProductId: line.kitProductId,
                kitProductName: line.kitProductName,
                kitBomQty: line.kitBomQty,
                sortOrder: index,
                serials: line.serialIds?.length
                  ? { create: line.serialIds.map((serialId) => ({ serialId })) }
                  : undefined,
              })),
          },
        },
        include: projectDispatchInclude,
      });

      await writeAuditLogTx(tx, {
        tableName: "project_dispatches",
        recordId: dispatch.id,
        action: "CREATE",
        newValue: { dispatchNo: dispatch.dispatchNo, status: dispatch.status },
        performedBy: input.createdById,
        companyId: input.companyId,
        reference: dispatch.dispatchNo,
      });

      if (input.confirm) {
        return confirmProjectDispatchTx(tx, {
          companyId: input.companyId,
          dispatchId: dispatch.id,
          performedById: input.createdById,
        });
      }

      return serializeProjectDispatch(dispatch);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

async function confirmProjectDispatchTx(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    dispatchId: string;
    performedById: string;
  },
) {
  const dispatch = await tx.projectDispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: {
      project: {
        include: {
          assignment: {
            include: {
              lines: {
                include: { product: { include: { category: true } } },
              },
            },
          },
        },
      },
      lines: {
        include: {
          product: true,
          materialLine: { include: { product: { include: { category: true } } } },
          serials: true,
        },
      },
    },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== ProjectDispatchStatus.DRAFT) throw new Error("INVALID_STATUS");
  if (dispatch.project.status === ProjectStatus.CLOSED) throw new Error("PROJECT_CLOSED");
  if (
    !dispatch.vehicleNo?.trim() ||
    !dispatch.receiverName?.trim() ||
    !dispatch.receiverMobile?.trim()
  ) {
    throw new Error("MANDATORY_DISPATCH_FIELDS_REQUIRED");
  }
  if (dispatch.lines.length === 0) throw new Error("LINES_REQUIRED");

  const kitProductIds = dispatch.lines
    .filter((line) => line.kitProductId)
    .map((line) => line.kitProductId!);
  const kitBomMap = await loadKitBomMap(tx, kitProductIds);

  const linesByMaterial = new Map<string, typeof dispatch.lines>();
  for (const line of dispatch.lines) {
    const group = linesByMaterial.get(line.materialLineId) ?? [];
    group.push(line);
    linesByMaterial.set(line.materialLineId, group);
  }

  const materialQtyUpdates = new Map<string, number>();

  for (const [materialLineId, groupLines] of linesByMaterial) {
    const materialLine = groupLines[0]!.materialLine;
    if (isKitProduct(materialLine.product) && materialLine.productId) {
      const bom = kitBomMap.get(materialLine.productId) ?? [];
      const kitQty = resolveKitDispatchQty({
        kitOrderedQty: decimalToNumber(materialLine.assignedQty),
        kitDispatchedQty: decimalToNumber(materialLine.dispatchedQty),
        bom,
        lines: groupLines.map((line) => ({
          productId: line.productId,
          qty: decimalToNumber(line.qty),
        })),
      });
      materialQtyUpdates.set(materialLineId, kitQty);
    } else {
      materialQtyUpdates.set(materialLineId, decimalToNumber(groupLines[0]!.qty));
    }
  }

  for (const line of dispatch.lines) {
    const qty = decimalToNumber(line.qty);
    const materialLine = line.materialLine;

    await executeProjectDispatchStockMove(tx, {
      projectCompanyId: input.companyId,
      projectsWarehouseId: dispatch.warehouseId,
      productId: line.productId,
      serialTracking: line.product.serialTracking,
      qty,
      serialIds: line.serials.map((entry) => entry.serialId),
      stockSourceLog: materialLine.stockSourceLog,
      performedById: input.performedById,
      referenceNote: `Project dispatch staging for ${dispatch.dispatchNo}`,
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

  for (const [materialLineId, qtyToAdd] of materialQtyUpdates) {
    const materialLine = dispatch.project.assignment!.lines.find(
      (line) => line.id === materialLineId,
    );
    if (!materialLine) continue;

    const newDispatchedQty = decimalToNumber(materialLine.dispatchedQty) + qtyToAdd;
    const requiredQty = decimalToNumber(materialLine.requiredQty);
    const assignedQty = decimalToNumber(materialLine.assignedQty);

    await tx.projectMaterialLine.update({
      where: { id: materialLineId },
      data: {
        dispatchedQty: newDispatchedQty,
        lineStatus: resolveLineStatusAfterDispatch(newDispatchedQty, requiredQty, assignedQty),
      },
    });
  }

  const refreshedLines = await tx.projectMaterialLine.findMany({
    where: { assignmentId: dispatch.project.assignment!.id },
  });

  await tx.project.update({
    where: { id: dispatch.projectId },
    data: {
      status: resolveProjectStatusAfterDispatch(
        refreshedLines.map((line) => ({
          requiredQty: decimalToNumber(line.requiredQty),
          assignedQty: decimalToNumber(line.assignedQty),
          dispatchedQty: decimalToNumber(line.dispatchedQty),
        })),
      ),
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
    oldValue: { status: ProjectDispatchStatus.DRAFT },
    newValue: { status: ProjectDispatchStatus.DISPATCHED },
    performedBy: input.performedById,
    companyId: input.companyId,
    reference: dispatch.dispatchNo,
  });

  return serializeProjectDispatch(updated);
}

export async function confirmProjectDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    performedById: string;
  },
) {
  return prisma.$transaction(
    (tx) => confirmProjectDispatchTx(tx, input),
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function listAvailableSerialsForProjectDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    productId: string;
  },
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
    select: { warehouseId: true },
  });
  if (!project) throw new Error("NOT_FOUND");

  const hoPools = await listHoWarehousePools(prisma, input.companyId);
  const sourceWarehouseIds = buildProjectDispatchSourceWarehouseIds(
    project.warehouseId,
    hoPools.map((pool) => pool.warehouseId),
  );

  return prisma.inventorySerial.findMany({
    where: {
      productId: input.productId,
      currentWarehouseId: { in: sourceWarehouseIds },
      status: SerialStatus.AVAILABLE,
    },
    select: { id: true, serialNumber: true, status: true },
    orderBy: { serialNumber: "asc" },
  });
}

export async function lookupSerialForProjectDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    serialNumber: string;
    productId?: string;
  },
) {
  const result = await lookupSerialsForProjectDispatch(prisma, {
    companyId: input.companyId,
    projectId: input.projectId,
    productId: input.productId,
    serialNumbers: [input.serialNumber],
  });
  if (result.valid[0]) return result.valid[0];
  const reason = result.invalid[0]?.reason;
  if (reason?.includes("different product")) throw new Error("WRONG_PRODUCT");
  throw new Error("SERIAL_NOT_FOUND");
}

export async function lookupSerialsForProjectDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    productId?: string;
    serialNumbers: string[];
  },
) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId },
    select: { id: true, warehouseId: true },
  });
  if (!project) throw new Error("NOT_FOUND");

  const hoPools = await listHoWarehousePools(prisma, input.companyId);
  const sourceWarehouseIds = buildProjectDispatchSourceWarehouseIds(
    project.warehouseId,
    hoPools.map((pool) => pool.warehouseId),
  );

  const valid: Array<{
    id: string;
    serialNumber: string;
    product: { id: string; displayName: string; serialTracking: boolean };
  }> = [];
  const invalid: Array<{ serialNumber: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const raw of input.serialNumbers) {
    const serialNumber = normalizeSerialNumber(raw);
    if (!serialNumber) continue;

    if (seen.has(serialNumber)) {
      invalid.push({ serialNumber, reason: "Duplicate in list." });
      continue;
    }
    seen.add(serialNumber);

    const serial = await prisma.inventorySerial.findFirst({
      where: {
        serialNumber,
        currentWarehouseId: { in: sourceWarehouseIds },
        status: SerialStatus.AVAILABLE,
        ...(input.productId ? { productId: input.productId } : {}),
      },
      include: {
        product: {
          select: { id: true, displayName: true, serialTracking: true },
        },
      },
    });

    if (!serial) {
      invalid.push({
        serialNumber,
        reason: "Serial not found or not available at Projects warehouse or HO.",
      });
      continue;
    }

    if (input.productId && serial.productId !== input.productId) {
      invalid.push({ serialNumber, reason: "Serial belongs to a different product." });
      continue;
    }

    valid.push({
      id: serial.id,
      serialNumber: serial.serialNumber,
      product: serial.product,
    });
  }

  return { valid, invalid };
}

export async function listProjectDispatchHistory(
  prisma: PrismaClient,
  companyId: string,
  projectId: string,
) {
  return listProjectDispatches(prisma, companyId, { projectId });
}
