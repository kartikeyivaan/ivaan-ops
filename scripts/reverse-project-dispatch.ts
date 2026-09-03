/**
 * Reverse a confirmed project dispatch that should never have happened
 * (e.g. a test DC raised against real stock).
 *
 * Releases its serials back to AVAILABLE, removes the dispatch ledger rows,
 * rolls back material-line dispatched qty and project status, and marks the
 * dispatch CANCELLED. Only safe for dispatches whose stock never physically
 * left the warehouse.
 *
 * Usage: npx tsx scripts/reverse-project-dispatch.ts ISE-PDC-26-27-00009 [--apply]
 */
import {
  InventoryEventStatus,
  PrismaClient,
  ProjectDispatchStatus,
  ProjectMaterialLineStatus,
  ProjectStatus,
  SerialStatus,
  type Prisma,
} from "@prisma/client";

const prisma = new PrismaClient();

const DISPATCH_NO = process.argv[2];
const APPLY = process.argv.includes("--apply");

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value);
}

function resolveLineStatus(
  dispatchedQty: number,
  requiredQty: number,
  assignedQty: number,
): ProjectMaterialLineStatus {
  if (dispatchedQty >= requiredQty) return ProjectMaterialLineStatus.FULLY_DISPATCHED;
  if (dispatchedQty > 0) return ProjectMaterialLineStatus.PARTIALLY_DISPATCHED;
  if (assignedQty >= requiredQty) return ProjectMaterialLineStatus.ASSIGNED;
  return ProjectMaterialLineStatus.PENDING_STOCK;
}

function resolveProjectStatus(
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

async function main() {
  if (!DISPATCH_NO) {
    console.error("Usage: npx tsx scripts/reverse-project-dispatch.ts <DISPATCH_NO> [--apply]");
    process.exitCode = 1;
    return;
  }

  const dispatch = await prisma.projectDispatch.findUnique({
    where: { dispatchNo: DISPATCH_NO },
    include: {
      warehouse: { select: { id: true, name: true } },
      project: {
        include: { assignment: { include: { lines: true } } },
      },
      lines: {
        include: {
          product: { select: { id: true, displayName: true, serialTracking: true } },
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

  if (!dispatch) {
    console.error(`Dispatch ${DISPATCH_NO} not found.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Dispatch ${dispatch.dispatchNo} | status=${dispatch.status}`);
  console.log(`Project ${dispatch.project.projectNo} (${dispatch.project.customerName}) status=${dispatch.project.status}`);
  console.log(`Warehouse ${dispatch.warehouse.name}`);
  console.log(`Receiver "${dispatch.receiverName ?? "-"}" vehicle "${dispatch.vehicleNo ?? "-"}"\n`);

  if (dispatch.status === ProjectDispatchStatus.CANCELLED) {
    console.log("Already cancelled. Nothing to do.");
    return;
  }

  // Guard: only reverse stock that is still sitting in the dispatching warehouse.
  const serialsToRelease: Array<{ id: string; serialNumber: string }> = [];
  let blocked = false;
  for (const line of dispatch.lines) {
    for (const row of line.serials) {
      const s = row.serial;
      if (s.status !== SerialStatus.DISPATCHED) {
        console.log(`  ! ${s.serialNumber} status is ${s.status}, expected DISPATCHED — skipping release.`);
        blocked = true;
        continue;
      }
      if (s.currentWarehouseId !== dispatch.warehouseId) {
        console.log(`  ! ${s.serialNumber} has since moved to another warehouse — skipping release.`);
        blocked = true;
        continue;
      }
      serialsToRelease.push({ id: s.id, serialNumber: s.serialNumber });
    }
    if (!line.product.serialTracking) {
      console.log(
        `  ! Line ${line.product.displayName} is non-serial (qty ${line.qty}); qty stock was deducted and is NOT restored by this script.`,
      );
      blocked = true;
    }
  }

  console.log("\nPlanned changes:");
  for (const s of serialsToRelease) {
    console.log(`  serial ${s.serialNumber}: DISPATCHED -> AVAILABLE`);
  }

  const ledgerRows = await prisma.inventoryTransaction.findMany({
    where: { referenceType: "PROJECT_DISPATCH", referenceId: dispatch.id },
    select: { id: true, qty: true, productId: true },
  });
  console.log(`  inventory transactions to delete: ${ledgerRows.length}`);

  const eventRows = await prisma.inventoryEvent.findMany({
    where: {
      sourceType: "PROJECT_DISPATCH",
      sourceId: dispatch.id,
      status: { not: InventoryEventStatus.CANCELLED },
    },
    select: { id: true },
  });
  console.log(`  inventory events to cancel: ${eventRows.length}`);

  const assignment = dispatch.project.assignment;
  const lineRollback = new Map<string, number>();
  for (const line of dispatch.lines) {
    lineRollback.set(
      line.materialLineId,
      (lineRollback.get(line.materialLineId) ?? 0) + toNumber(line.qty),
    );
  }

  const plannedLines: Array<{
    id: string;
    requiredQty: number;
    assignedQty: number;
    dispatchedQty: number;
  }> = [];
  for (const line of assignment?.lines ?? []) {
    const rollback = lineRollback.get(line.id) ?? 0;
    const current = toNumber(line.dispatchedQty);
    const next = Math.max(0, current - rollback);
    if (rollback > 0) {
      console.log(`  material line ${line.id}: dispatchedQty ${current} -> ${next}`);
    }
    plannedLines.push({
      id: line.id,
      requiredQty: toNumber(line.requiredQty),
      assignedQty: toNumber(line.assignedQty),
      dispatchedQty: next,
    });
  }

  const nextProjectStatus = resolveProjectStatus(plannedLines);
  console.log(`  project status: ${dispatch.project.status} -> ${nextProjectStatus}`);
  console.log(`  dispatch status: ${dispatch.status} -> CANCELLED`);

  if (blocked) {
    console.log("\nRefusing to apply: some stock has moved on since this dispatch. Resolve manually.");
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to commit.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventorySerial.updateMany({
      where: { id: { in: serialsToRelease.map((s) => s.id) } },
      data: { status: SerialStatus.AVAILABLE },
    });

    await tx.inventoryTransaction.deleteMany({
      where: { referenceType: "PROJECT_DISPATCH", referenceId: dispatch.id },
    });

    await tx.inventoryEvent.updateMany({
      where: { sourceType: "PROJECT_DISPATCH", sourceId: dispatch.id },
      data: { status: InventoryEventStatus.CANCELLED },
    });

    for (const line of plannedLines) {
      if (!lineRollback.has(line.id)) continue;
      await tx.projectMaterialLine.update({
        where: { id: line.id },
        data: {
          dispatchedQty: line.dispatchedQty,
          lineStatus: resolveLineStatus(
            line.dispatchedQty,
            line.requiredQty,
            line.assignedQty,
          ),
        },
      });
    }

    await tx.project.update({
      where: { id: dispatch.projectId },
      data: { status: nextProjectStatus },
    });

    await tx.projectDispatch.update({
      where: { id: dispatch.id },
      data: { status: ProjectDispatchStatus.CANCELLED, dispatchedAt: null },
    });

    await tx.auditLog.create({
      data: {
        tableName: "project_dispatches",
        recordId: dispatch.id,
        action: "UPDATE",
        oldValue: { status: dispatch.status },
        newValue: { status: ProjectDispatchStatus.CANCELLED },
        companyId: dispatch.companyId,
        reference: dispatch.dispatchNo,
        reason: "Reversed test dispatch raised against real stock (data correction).",
      },
    });
  });

  console.log("\nApplied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
