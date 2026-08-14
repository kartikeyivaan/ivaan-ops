import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  ProjectMaterialLineSource,
  ProjectMaterialLineStatus,
  ProjectStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber } from "@/lib/inventory";
import { upsertProjectMaterialPurchaseRequest } from "@/lib/purchase-request-service";
import { loadProjectOrThrow, getProjectById } from "@/lib/project-service";
import { isProjectReadOnly, canEditProjectMaterial } from "@/lib/project-permissions";
import {
  allocateLineStock,
  executeTransferBatches,
  mergeStockSourceLog,
  mergeTransferBatches,
  resolveStockCompanies,
  type StockSourceLogEntry,
  type TransferBatch,
} from "@/lib/project-stock-service";
export async function addMaterialLine(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    productId: string;
    requiredQty: number;
    remarks?: string;
    performedById: string;
  },
) {
  if (input.requiredQty <= 0) {
    throw new Error("INVALID_QTY");
  }

  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);
  if (isProjectReadOnly(project.status)) {
    throw new Error("PROJECT_CLOSED");
  }
  if (!project.assignment) {
    throw new Error("ASSIGNMENT_NOT_FOUND");
  }

  const maxSort = project.assignment.lines.reduce(
    (max, line) => Math.max(max, line.sortOrder),
    -1,
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.projectMaterialLine.create({
      data: {
        assignmentId: project.assignment!.id,
        productId: input.productId,
        source: ProjectMaterialLineSource.ADDED,
        requiredQty: input.requiredQty,
        lineStatus: ProjectMaterialLineStatus.DRAFT,
        sortOrder: maxSort + 1,
        remarks: input.remarks,
      },
    });

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.MATERIAL_DRAFT,
        updatedById: input.performedById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "project_material_lines",
      recordId: project.id,
      action: "CREATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { productId: input.productId, requiredQty: input.requiredQty },
      reference: project.projectNo,
    });

    return getProjectById(tx as PrismaClient, input.companyId, input.projectId);
  });

  return updated;
}

export async function updateMaterialLine(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    lineId: string;
    requiredQty: number;
    remarks?: string | null;
    performedById: string;
  },
) {
  if (input.requiredQty <= 0) {
    throw new Error("INVALID_QTY");
  }

  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);
  if (isProjectReadOnly(project.status)) {
    throw new Error("PROJECT_CLOSED");
  }

  const line = project.assignment?.lines.find((entry) => entry.id === input.lineId);
  if (!line) {
    throw new Error("LINE_NOT_FOUND");
  }

  if (Number(line.dispatchedQty) > 0 && input.requiredQty < Number(line.dispatchedQty)) {
    throw new Error("QTY_BELOW_DISPATCHED");
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMaterialLine.update({
      where: { id: line.id },
      data: {
        requiredQty: input.requiredQty,
        remarks: input.remarks ?? line.remarks,
        lineStatus:
          line.lineStatus === ProjectMaterialLineStatus.APPROVED ||
          line.lineStatus === ProjectMaterialLineStatus.ASSIGNED
            ? ProjectMaterialLineStatus.DRAFT
            : line.lineStatus,
      },
    });

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.MATERIAL_DRAFT,
        updatedById: input.performedById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "project_material_lines",
      recordId: line.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { requiredQty: input.requiredQty },
      reference: project.projectNo,
    });
  });

  return getProjectById(prisma, input.companyId, input.projectId);
}

export async function deleteMaterialLine(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    lineId: string;
    performedById: string;
  },
) {
  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);
  if (isProjectReadOnly(project.status)) {
    throw new Error("PROJECT_CLOSED");
  }

  const line = project.assignment?.lines.find((entry) => entry.id === input.lineId);
  if (!line) {
    throw new Error("LINE_NOT_FOUND");
  }
  if (line.source !== ProjectMaterialLineSource.ADDED) {
    throw new Error("CANNOT_DELETE_PROPOSAL_LINE");
  }
  if (Number(line.dispatchedQty) > 0) {
    throw new Error("LINE_ALREADY_DISPATCHED");
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMaterialLine.delete({ where: { id: line.id } });

    await writeAuditLogTx(tx, {
      tableName: "project_material_lines",
      recordId: line.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { deleted: true, productId: line.productId },
      reference: project.projectNo,
    });
  });

  return getProjectById(prisma, input.companyId, input.projectId);
}

export type ProjectMaterialApprovalPayload = {
  lineIds: string[];
  lines: Array<{
    lineId: string;
    productId: string;
    productName: string;
    source: ProjectMaterialLineSource;
    previousQty: number | null;
    requiredQty: number;
  }>;
};

type MaterialLineRecord = NonNullable<
  Awaited<ReturnType<typeof loadProjectOrThrow>>["assignment"]
>["lines"][number];

export function lineNeedsApproval(line: {
  source: ProjectMaterialLineSource;
  requiredQty: unknown;
  lastApprovedQty: unknown;
  lineStatus: ProjectMaterialLineStatus;
}): boolean {
  const required = decimalToNumber(line.requiredQty as never);
  const lastApproved =
    line.lastApprovedQty != null ? decimalToNumber(line.lastApprovedQty as never) : null;

  if (line.source === ProjectMaterialLineSource.ADDED && lastApproved == null) {
    return true;
  }
  if (lastApproved == null) {
    return line.lineStatus === ProjectMaterialLineStatus.DRAFT;
  }
  return required !== lastApproved;
}

export function linesNeedingApproval(lines: MaterialLineRecord[]): MaterialLineRecord[] {
  return lines.filter(lineNeedsApproval);
}

function buildApprovalPayload(lines: MaterialLineRecord[]): ProjectMaterialApprovalPayload {
  return {
    lineIds: lines.map((line) => line.id),
    lines: lines.map((line) => ({
      lineId: line.id,
      productId: line.productId,
      productName: line.product.displayName,
      source: line.source,
      previousQty:
        line.lastApprovedQty != null ? decimalToNumber(line.lastApprovedQty) : null,
      requiredQty: decimalToNumber(line.requiredQty),
    })),
  };
}

function resolveLineStatusAfterApproval(assignedQty: number, requiredQty: number) {
  if (assignedQty >= requiredQty) return ProjectMaterialLineStatus.ASSIGNED;
  if (assignedQty > 0) return ProjectMaterialLineStatus.PENDING_STOCK;
  return ProjectMaterialLineStatus.PENDING_STOCK;
}

function resolveProjectStatusAfterApproval(
  lines: Array<{ requiredQty: number; assignedQty: number; dispatchedQty: number }>,
): ProjectStatus {
  const allFullyAssigned = lines.every((line) => line.assignedQty >= line.requiredQty);
  const anyDispatchable = lines.some((line) => line.assignedQty > line.dispatchedQty);

  if (anyDispatchable) {
    return ProjectStatus.READY_FOR_DISPATCH;
  }
  if (allFullyAssigned) {
    return ProjectStatus.MATERIAL_ASSIGNED;
  }
  return ProjectStatus.MATERIAL_ASSIGNED;
}

export async function submitMaterialAssignmentForApproval(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    performedById: string;
    userRoles: string[];
  },
) {
  if (!canEditProjectMaterial(input.userRoles)) {
    throw new Error("FORBIDDEN");
  }

  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);
  if (isProjectReadOnly(project.status)) {
    throw new Error("PROJECT_CLOSED");
  }
  if (!project.assignment?.lines.length) {
    throw new Error("ASSIGNMENT_EMPTY");
  }

  const deltaLines = linesNeedingApproval(project.assignment.lines);
  if (deltaLines.length === 0) {
    throw new Error("NO_DELTA");
  }

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.PROJECT_MATERIAL,
      moduleId: project.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (pending) {
    throw new Error("PENDING_APPROVAL_EXISTS");
  }

  const payload = buildApprovalPayload(deltaLines);

  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.PROJECT_MATERIAL,
        moduleId: project.id,
        requestedById: input.performedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: JSON.stringify(payload),
      },
    });

    await tx.projectMaterialLine.updateMany({
      where: { id: { in: deltaLines.map((line) => line.id) } },
      data: { lineStatus: ProjectMaterialLineStatus.PENDING_APPROVAL },
    });

    await tx.projectMaterialAssignment.update({
      where: { id: project.assignment!.id },
      data: { submittedAt: new Date() },
    });

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.MATERIAL_PENDING_APPROVAL,
        updatedById: input.performedById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "projects",
      recordId: project.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { action: "submit_material_approval", lineIds: payload.lineIds },
      reference: project.projectNo,
    });
  });

  return getProjectById(prisma, input.companyId, input.projectId);
}

export async function approveProjectMaterialAssignment(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    performedById: string;
    performedByName: string;
    userRoles: string[];
    remarks?: string;
  },
) {
  if (!canEditProjectMaterial(input.userRoles)) {
    throw new Error("FORBIDDEN");
  }

  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);
  if (isProjectReadOnly(project.status)) {
    throw new Error("PROJECT_CLOSED");
  }

  const approval = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.PROJECT_MATERIAL,
      moduleId: project.id,
      status: ApprovalRequestStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!approval) {
    throw new Error("APPROVAL_NOT_PENDING");
  }

  let payload: ProjectMaterialApprovalPayload;
  try {
    payload = JSON.parse(approval.remarks ?? "{}") as ProjectMaterialApprovalPayload;
  } catch {
    throw new Error("INVALID_APPROVAL_PAYLOAD");
  }

  const stockCompanies = await resolveStockCompanies(prisma, project.companyId);
  const lineMap = new Map(project.assignment!.lines.map((line) => [line.id, line]));
  const batchesToRun: TransferBatch[] = [];

  const lineUpdates: Array<{
    lineId: string;
    assignedQty: number;
    requiredQty: number;
    lineStatus: ProjectMaterialLineStatus;
    stockSourceLog: StockSourceLogEntry[];
    lastApprovedQty: number;
  }> = [];

  for (const snapshot of payload.lines) {
    const line = lineMap.get(snapshot.lineId);
    if (!line) continue;

    const requiredQty = decimalToNumber(line.requiredQty);
    const currentAssigned = decimalToNumber(line.assignedQty);
    const qtyNeeded = Math.max(0, requiredQty - currentAssigned);

    let transferredQty = 0;
    let sourceEntries: StockSourceLogEntry[] = [];
    let transferBatches: Parameters<typeof mergeTransferBatches>[0] = [];

    if (qtyNeeded > 0) {
      const allocation = await allocateLineStock(prisma, {
        iseCompanyId: stockCompanies.iseCompanyId,
        iseHoWarehouseId: stockCompanies.iseHoWarehouseId,
        pcmCompanyId: stockCompanies.pcmCompanyId,
        pcmHoWarehouseId: stockCompanies.pcmHoWarehouseId,
        productId: line.productId,
        serialTracking: line.product.serialTracking,
        qtyNeeded,
      });
      transferredQty = allocation.transferredQty;
      sourceEntries = allocation.sourceEntries;
      transferBatches = allocation.transferBatches;
      batchesToRun.push(...transferBatches);
    }

    const newAssignedQty = currentAssigned + transferredQty;
    const shortfallQty = Math.max(0, requiredQty - newAssignedQty);
    const mergedLog = mergeStockSourceLog(line.stockSourceLog, sourceEntries);

    if (shortfallQty > 0) {
      await upsertProjectMaterialPurchaseRequest(prisma, {
        companyId: project.companyId,
        companyCode: project.company.code,
        projectId: project.id,
        projectNo: project.projectNo,
        proposalNo: project.proposal.proposalNo,
        materialLineId: line.id,
        productId: line.productId,
        requestedQty: shortfallQty,
        warehouseId: project.warehouseId,
        requestedById: input.performedById,
        requestedByName: input.performedByName,
      });
    }

    lineUpdates.push({
      lineId: line.id,
      assignedQty: newAssignedQty,
      requiredQty,
      lineStatus: resolveLineStatusAfterApproval(newAssignedQty, requiredQty),
      stockSourceLog: mergedLog,
      lastApprovedQty: requiredQty,
    });
  }

  const mergedBatches = mergeTransferBatches(batchesToRun);
  if (mergedBatches.length > 0) {
    await executeTransferBatches(prisma, {
      batches: mergedBatches,
      toCompanyId: project.companyId,
      toWarehouseId: project.warehouseId,
      performedById: input.performedById,
      referenceNote: `Project material transfer for ${project.projectNo}`,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const update of lineUpdates) {
      await tx.projectMaterialLine.update({
        where: { id: update.lineId },
        data: {
          assignedQty: update.assignedQty,
          lineStatus: update.lineStatus,
          stockSourceLog: update.stockSourceLog,
          lastApprovedQty: update.lastApprovedQty,
        },
      });
    }

    const refreshedLines = await tx.projectMaterialLine.findMany({
      where: { assignmentId: project.assignment!.id },
    });

    const statusSnapshot = refreshedLines.map((line) => ({
      requiredQty: decimalToNumber(line.requiredQty),
      assignedQty: decimalToNumber(line.assignedQty),
      dispatchedQty: decimalToNumber(line.dispatchedQty),
    }));

    await tx.projectMaterialAssignment.update({
      where: { id: project.assignment!.id },
      data: {
        approvedAt: new Date(),
        approvedById: input.performedById,
      },
    });

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: resolveProjectStatusAfterApproval(statusSnapshot),
        updatedById: input.performedById,
      },
    });

    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.performedById,
        remarks: input.remarks ?? approval.remarks,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "projects",
      recordId: project.id,
      action: "APPROVE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: {
        action: "approve_material",
        lineCount: lineUpdates.length,
        transferBatchCount: mergedBatches.length,
      },
      reference: project.projectNo,
    });
  });

  return getProjectById(prisma, input.companyId, input.projectId);
}

export async function rejectProjectMaterialAssignment(
  prisma: PrismaClient,
  input: {
    companyId: string;
    projectId: string;
    performedById: string;
    userRoles: string[];
    reason: string;
  },
) {
  if (!canEditProjectMaterial(input.userRoles)) {
    throw new Error("FORBIDDEN");
  }

  const project = await loadProjectOrThrow(prisma, input.companyId, input.projectId);

  const approval = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.PROJECT_MATERIAL,
      moduleId: project.id,
      status: ApprovalRequestStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!approval) {
    throw new Error("APPROVAL_NOT_PENDING");
  }

  let payload: ProjectMaterialApprovalPayload | null = null;
  try {
    payload = JSON.parse(approval.remarks ?? "{}") as ProjectMaterialApprovalPayload;
  } catch {
    payload = null;
  }

  await prisma.$transaction(async (tx) => {
    if (payload?.lineIds?.length) {
      await tx.projectMaterialLine.updateMany({
        where: { id: { in: payload.lineIds } },
        data: { lineStatus: ProjectMaterialLineStatus.DRAFT },
      });
    }

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.MATERIAL_DRAFT,
        updatedById: input.performedById,
      },
    });

    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.performedById,
        remarks: input.reason,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "projects",
      recordId: project.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { action: "reject_material", reason: input.reason },
      reference: project.projectNo,
    });
  });

  return getProjectById(prisma, input.companyId, input.projectId);
}

export { serializeProject } from "@/lib/project-service";