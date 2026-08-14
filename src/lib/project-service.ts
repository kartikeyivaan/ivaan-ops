import {
  ProjectDispatchStatus,
  ProjectMaterialLineSource,
  ProjectMaterialLineStatus,
  ProjectStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { assertProjectsCompany } from "@/lib/company-scope";
import { decimalToNumber } from "@/lib/inventory";
import {
  mergeStockSourceLog,
  parseStockSourceLog,
  resolveStockCompanies,
  returnMaterialLineStock,
  transferReceivedStockToProjectWarehouse,
  type StockSourceLogEntry,
} from "@/lib/project-stock-service";
import { notifyProjectMaterialStockReceived } from "@/lib/notification-service";
import { type ProjectProposalRecord } from "@/lib/project-proposal-service";
import { generateProjectNumber } from "@/lib/projects";
import { isProjectReadOnly } from "@/lib/project-permissions";

export const projectInclude = {
  company: { select: { id: true, name: true, code: true } },
  proposal: { select: { id: true, proposalNo: true, status: true, salesUserId: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  closedBy: { select: { id: true, name: true, email: true } },
  assignment: {
    include: {
      lines: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          product: {
            select: {
              id: true,
              displayName: true,
              capacity: true,
              capacityUnit: true,
              serialTracking: true,
              category: { select: { name: true } },
              brand: { select: { name: true } },
            },
          },
          purchaseRequestLine: {
            select: {
              id: true,
              requestedQty: true,
              fulfilledQty: true,
              purchaseRequest: { select: { id: true, requestNumber: true, status: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectInclude;

type ProjectRecord = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export type SerializedProjectMaterialLine = {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  brandName: string;
  source: ProjectMaterialLineSource;
  requiredQty: number;
  assignedQty: number;
  dispatchedQty: number;
  balanceQty: number;
  lineStatus: ProjectMaterialLineStatus;
  sortOrder: number;
  lastApprovedQty: number | null;
  remarks: string | null;
  purchaseRequestLineId: string | null;
  purchaseRequestNumber: string | null;
};

export type SerializedProject = {
  id: string;
  projectNo: string;
  companyId: string;
  proposalId: string;
  proposalNo: string;
  revisionId: string;
  warehouseId: string;
  warehouseName: string;
  customerName: string;
  customerMobile: string;
  siteAddress: string;
  status: ProjectStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignment: {
    id: string;
    lines: SerializedProjectMaterialLine[];
  } | null;
};

function serializeLine(
  line: NonNullable<ProjectRecord["assignment"]>["lines"][number],
): SerializedProjectMaterialLine {
  const requiredQty = decimalToNumber(line.requiredQty);
  const assignedQty = decimalToNumber(line.assignedQty);
  const dispatchedQty = decimalToNumber(line.dispatchedQty);
  return {
    id: line.id,
    productId: line.productId,
    productName: line.product.displayName,
    categoryName: line.product.category.name,
    brandName: line.product.brand.name,
    source: line.source,
    requiredQty,
    assignedQty,
    dispatchedQty,
    balanceQty: Math.max(0, assignedQty - dispatchedQty),
    lineStatus: line.lineStatus,
    sortOrder: line.sortOrder,
    lastApprovedQty:
      line.lastApprovedQty != null ? decimalToNumber(line.lastApprovedQty) : null,
    remarks: line.remarks,
    purchaseRequestLineId: line.purchaseRequestLine?.id ?? null,
    purchaseRequestNumber:
      line.purchaseRequestLine?.purchaseRequest.requestNumber ?? null,
  };
}

export function serializeProject(record: ProjectRecord): SerializedProject {
  return {
    id: record.id,
    projectNo: record.projectNo,
    companyId: record.companyId,
    proposalId: record.proposalId,
    proposalNo: record.proposal.proposalNo,
    revisionId: record.revisionId,
    warehouseId: record.warehouseId,
    warehouseName: record.warehouse.name,
    customerName: record.customerName,
    customerMobile: record.customerMobile,
    siteAddress: record.siteAddress,
    status: record.status,
    closedAt: record.closedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    assignment: record.assignment
      ? {
          id: record.assignment.id,
          lines: record.assignment.lines.map(serializeLine),
        }
      : null,
  };
}

export async function findJalgaonProjectsWarehouse(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId, code: "JAL-PRJ", isActive: true },
  });
  if (!warehouse) {
    throw new Error("PROJECTS_WAREHOUSE_NOT_FOUND");
  }
  return warehouse;
}

export async function createProjectFromProposal(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    companyCode: string;
    proposal: ProjectProposalRecord;
    revision: ProjectProposalRecord["revisions"][number];
    performedById: string;
  },
) {
  assertProjectsCompany({ code: input.companyCode });

  const existing = await tx.project.findUnique({
    where: { proposalId: input.proposal.id },
  });
  if (existing) {
    throw new Error("ALREADY_CONVERTED");
  }

  const warehouse = await findJalgaonProjectsWarehouse(tx, input.companyId);
  const projectNo = await generateProjectNumber(tx, input.companyCode, input.companyId);

  const project = await tx.project.create({
    data: {
      projectNo,
      companyId: input.companyId,
      proposalId: input.proposal.id,
      revisionId: input.revision.id,
      warehouseId: warehouse.id,
      customerName: input.revision.customerName,
      customerMobile: input.revision.customerMobile,
      siteAddress: input.revision.shortAddress,
      status: ProjectStatus.OPEN,
      createdById: input.performedById,
      updatedById: input.performedById,
      assignment: {
        create: {},
      },
    },
    include: projectInclude,
  });

  await writeAuditLogTx(tx, {
    tableName: "projects",
    recordId: project.id,
    action: "CREATE",
    performedBy: input.performedById,
    companyId: input.companyId,
    newValue: { projectNo, proposalId: input.proposal.id },
    reference: projectNo,
  });

  return project;
}

export async function applyApprovedProposalRevisionToProject(
  tx: Prisma.TransactionClient,
  input: {
    proposalId: string;
    companyId: string;
    revision: ProjectProposalRecord["revisions"][number];
    performedById: string;
  },
) {
  const project = await tx.project.findUnique({
    where: { proposalId: input.proposalId },
  });
  if (!project) {
    return null;
  }
  if (isProjectReadOnly(project.status)) {
    throw new Error("PROJECT_CLOSED");
  }

  await tx.project.update({
    where: { id: project.id },
    data: {
      revisionId: input.revision.id,
      customerName: input.revision.customerName,
      customerMobile: input.revision.customerMobile,
      siteAddress: input.revision.shortAddress,
      updatedById: input.performedById,
    },
  });

  await writeAuditLogTx(tx, {
    tableName: "projects",
    recordId: project.id,
    action: "UPDATE",
    performedBy: input.performedById,
    companyId: input.companyId,
    newValue: {
      revisionId: input.revision.id,
      customerName: input.revision.customerName,
    },
    reference: project.projectNo,
  });

  return project;
}

export async function listProjects(
  prisma: PrismaClient,
  companyId: string,
  filters?: { q?: string; status?: ProjectStatus },
) {
  const q = filters?.q?.trim();
  const records = await prisma.project.findMany({
    where: {
      companyId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { projectNo: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              { siteAddress: { contains: q, mode: "insensitive" } },
              { customerMobile: { contains: q, mode: "insensitive" } },
              { proposal: { proposalNo: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: projectInclude,
    orderBy: { createdAt: "desc" },
  });

  return records.map(serializeProject);
}

export async function getProjectById(
  prisma: PrismaClient,
  companyId: string,
  projectId: string,
) {
  const record = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: projectInclude,
  });
  if (!record) {
    throw new Error("NOT_FOUND");
  }
  return serializeProject(record);
}

export async function getProjectIdByProposalId(
  prisma: PrismaClient,
  companyId: string,
  proposalId: string,
) {
  const record = await prisma.project.findFirst({
    where: { proposalId, companyId },
    select: { id: true, projectNo: true },
  });
  return record;
}

export async function loadProjectOrThrow(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  projectId: string,
) {
  const record = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: projectInclude,
  });
  if (!record) {
    throw new Error("NOT_FOUND");
  }
  return record;
}

function resolveLineStatusAfterAssignment(
  assignedQty: number,
  requiredQty: number,
  dispatchedQty: number,
): ProjectMaterialLineStatus {
  if (dispatchedQty >= requiredQty) return ProjectMaterialLineStatus.FULLY_DISPATCHED;
  if (dispatchedQty > 0) return ProjectMaterialLineStatus.PARTIALLY_DISPATCHED;
  if (assignedQty >= requiredQty) return ProjectMaterialLineStatus.ASSIGNED;
  if (assignedQty > 0) return ProjectMaterialLineStatus.PENDING_STOCK;
  return ProjectMaterialLineStatus.PENDING_STOCK;
}

function resolveProjectStatusFromLines(
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

export type LinkedPurchaseRequest = {
  id: string;
  requestNumber: string;
  status: string;
  productName: string;
  requestedQty: number;
  fulfilledQty: number;
  materialLineId: string;
};

export async function listLinkedPurchaseRequests(
  prisma: PrismaClient,
  companyId: string,
  projectId: string,
): Promise<LinkedPurchaseRequest[]> {
  const lines = await prisma.purchaseRequestLine.findMany({
    where: { projectId, purchaseRequest: { companyId } },
    include: {
      product: { select: { displayName: true } },
      purchaseRequest: { select: { id: true, requestNumber: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return lines.map((line) => ({
    id: line.purchaseRequest.id,
    requestNumber: line.purchaseRequest.requestNumber,
    status: line.purchaseRequest.status,
    productName: line.product.displayName,
    requestedQty: decimalToNumber(line.requestedQty),
    fulfilledQty: decimalToNumber(line.fulfilledQty),
    materialLineId: line.projectMaterialLineId ?? "",
  }));
}

async function returnLineBalance(
  tx: Prisma.TransactionClient,
  input: {
    project: Awaited<ReturnType<typeof loadProjectOrThrow>>;
    line: NonNullable<Awaited<ReturnType<typeof loadProjectOrThrow>>["assignment"]>["lines"][number];
    returnQty: number;
    performedById: string;
    referenceNote: string;
    fallbackHo?: StockSourceLogEntry;
  },
) {
  const balance = Math.max(
    0,
    decimalToNumber(input.line.assignedQty) - decimalToNumber(input.line.dispatchedQty),
  );
  const qty = Math.min(input.returnQty, balance);
  if (qty <= 0) return 0;

  await returnMaterialLineStock(tx, {
    projectCompanyId: input.project.companyId,
    projectWarehouseId: input.project.warehouseId,
    productId: input.line.productId,
    serialTracking: input.line.product.serialTracking,
    stockSourceLog: input.line.stockSourceLog,
    returnQty: qty,
    performedById: input.performedById,
    referenceNote: input.referenceNote,
    fallbackHo: input.fallbackHo,
  });

  const newAssigned = decimalToNumber(input.line.assignedQty) - qty;
  await tx.projectMaterialLine.update({
    where: { id: input.line.id },
    data: {
      assignedQty: newAssigned,
      lineStatus: resolveLineStatusAfterAssignment(
        newAssigned,
        decimalToNumber(input.line.requiredQty),
        decimalToNumber(input.line.dispatchedQty),
      ),
    },
  });

  return qty;
}

export async function returnProjectStock(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    lineId: string;
    qty: number;
    performedById: string;
    remarks?: string;
  },
) {
  if (input.qty <= 0) throw new Error("INVALID_QTY");

  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);
  if (isProjectReadOnly(project.status)) throw new Error("PROJECT_CLOSED");

  const line = project.assignment?.lines.find((row) => row.id === input.lineId);
  if (!line) throw new Error("LINE_NOT_FOUND");

  const balance = Math.max(
    0,
    decimalToNumber(line.assignedQty) - decimalToNumber(line.dispatchedQty),
  );
  if (input.qty > balance) throw new Error("EXCEEDS_RETURN_BALANCE");

  const stockCompanies = await resolveStockCompanies(prisma, project.companyId);
  const fallbackHo: StockSourceLogEntry = {
    companyId: stockCompanies.iseCompanyId,
    warehouseId: stockCompanies.iseHoWarehouseId,
    qty: input.qty,
  };

  await prisma.$transaction(async (tx) => {
    const returnedQty = await returnLineBalance(tx, {
      project,
      line,
      returnQty: input.qty,
      performedById: input.performedById,
      referenceNote: `Manual project stock return for ${project.projectNo}${input.remarks ? `: ${input.remarks}` : ""}`,
      fallbackHo,
    });

    await writeAuditLogTx(tx, {
      tableName: "projects",
      recordId: project.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: {
        action: "return_stock",
        lineId: input.lineId,
        returnedQty,
        remarks: input.remarks ?? null,
      },
      reference: project.projectNo,
    });
  });

  return getProjectById(prisma, input.companyId, input.projectId);
}

export async function closeProject(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    performedById: string;
  },
) {
  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);
  if (project.status === ProjectStatus.CLOSED) throw new Error("ALREADY_CLOSED");

  const stockCompanies = await resolveStockCompanies(prisma, project.companyId);
  const fallbackHo: StockSourceLogEntry = {
    companyId: stockCompanies.iseCompanyId,
    warehouseId: stockCompanies.iseHoWarehouseId,
    qty: 0,
  };

  const returnSummary: Array<{ productId: string; productName: string; qty: number }> = [];

  await prisma.$transaction(async (tx) => {
    await tx.projectDispatch.updateMany({
      where: {
        projectId: project.id,
        status: ProjectDispatchStatus.DRAFT,
      },
      data: { status: ProjectDispatchStatus.CANCELLED },
    });

    if (project.assignment) {
      for (const line of project.assignment.lines) {
        const balance = Math.max(
          0,
          decimalToNumber(line.assignedQty) - decimalToNumber(line.dispatchedQty),
        );
        if (balance <= 0) continue;

        const sources = parseStockSourceLog(line.stockSourceLog);
        const usedFallback = sources.length === 0;

        const returnedQty = await returnLineBalance(tx, {
          project,
          line,
          returnQty: balance,
          performedById: input.performedById,
          referenceNote: `Auto-return on project close ${project.projectNo}`,
          fallbackHo: usedFallback ? { ...fallbackHo, qty: balance } : undefined,
        });

        if (returnedQty > 0) {
          returnSummary.push({
            productId: line.productId,
            productName: line.product.displayName,
            qty: returnedQty,
          });
        }

        if (usedFallback && returnedQty > 0) {
          await writeAuditLogTx(tx, {
            tableName: "projects",
            recordId: project.id,
            action: "UPDATE",
            performedBy: input.performedById,
            companyId: input.companyId,
            newValue: {
              action: "return_fallback_ise_ho",
              lineId: line.id,
              returnedQty,
            },
            reference: project.projectNo,
          });
        }
      }
    }

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.CLOSED,
        closedAt: new Date(),
        closedById: input.performedById,
        updatedById: input.performedById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "projects",
      recordId: project.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      oldValue: { status: project.status },
      newValue: {
        status: ProjectStatus.CLOSED,
        returnedLines: returnSummary,
      },
      reference: project.projectNo,
    });
  });

  return getProjectById(prisma, input.companyId, input.projectId);
}

export async function fulfillProjectMaterialFromIncoming(
  tx: Prisma.TransactionClient,
  input: {
    purchaseRequestLineId: string;
    receivedQty: number;
    fromWarehouseId: string;
    companyId: string;
    performedById: string;
  },
) {
  if (input.receivedQty <= 0) return;

  const prLine = await tx.purchaseRequestLine.findUnique({
    where: { id: input.purchaseRequestLineId },
    include: {
      projectMaterialLine: {
        include: {
          product: true,
          assignment: {
            include: {
              project: {
                include: { proposal: { select: { proposalNo: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!prLine?.projectMaterialLineId || !prLine.projectMaterialLine) return;

  const materialLine = prLine.projectMaterialLine;
  const project = materialLine.assignment.project;
  if (project.status === ProjectStatus.CLOSED) return;
  if (project.companyId !== input.companyId) return;

  const requiredQty = decimalToNumber(materialLine.requiredQty);
  const assignedQty = decimalToNumber(materialLine.assignedQty);
  const needQty = Math.max(0, requiredQty - assignedQty);
  const qtyToTransfer = Math.min(input.receivedQty, needQty);
  if (qtyToTransfer <= 0) return;

  await transferReceivedStockToProjectWarehouse(tx, {
    fromCompanyId: project.companyId,
    fromWarehouseId: input.fromWarehouseId,
    toWarehouseId: project.warehouseId,
    productId: materialLine.productId,
    serialTracking: materialLine.product.serialTracking,
    qty: qtyToTransfer,
    performedById: input.performedById,
    referenceNote: `PR fulfillment transfer for ${project.projectNo}`,
  });

  const newAssignedQty = assignedQty + qtyToTransfer;
  const sourceEntry: StockSourceLogEntry = {
    companyId: project.companyId,
    warehouseId: input.fromWarehouseId,
    qty: qtyToTransfer,
  };

  await tx.projectMaterialLine.update({
    where: { id: materialLine.id },
    data: {
      assignedQty: newAssignedQty,
      stockSourceLog: mergeStockSourceLog(materialLine.stockSourceLog, [sourceEntry]),
      lineStatus: resolveLineStatusAfterAssignment(
        newAssignedQty,
        requiredQty,
        decimalToNumber(materialLine.dispatchedQty),
      ),
    },
  });

  const refreshedLines = await tx.projectMaterialLine.findMany({
    where: { assignmentId: materialLine.assignmentId },
  });

  await tx.project.update({
    where: { id: project.id },
    data: {
      status: resolveProjectStatusFromLines(
        refreshedLines.map((line) => ({
          requiredQty: decimalToNumber(line.requiredQty),
          assignedQty: decimalToNumber(line.assignedQty),
          dispatchedQty: decimalToNumber(line.dispatchedQty),
        })),
      ),
      updatedById: input.performedById,
    },
  });

  await writeAuditLogTx(tx, {
    tableName: "projects",
    recordId: project.id,
    action: "UPDATE",
    performedBy: input.performedById,
    companyId: input.companyId,
    newValue: {
      action: "pr_fulfillment_transfer",
      materialLineId: materialLine.id,
      qty: qtyToTransfer,
      purchaseRequestLineId: prLine.id,
    },
    reference: project.projectNo,
  });

  await notifyProjectMaterialStockReceived(tx, {
    companyId: project.companyId,
    projectNo: project.projectNo,
    productName: materialLine.product.displayName,
    qty: qtyToTransfer,
  });
}
