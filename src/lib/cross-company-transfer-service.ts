import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  InventoryTransactionType,
  LotStatus,
  PiCrossCompanyTransferPlanStatus,
  Prisma,
  SerialStatus,
  TransferOrigin,
  TransferStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { getRemainingQty } from "@/lib/dispatches";
import {
  decimalToNumber,
  generateLotNumber,
  generateTransferNumber,
  systemPurchaseInvoiceNo,
} from "@/lib/inventory";
import { getProductStockSummary } from "@/lib/inventory-service";
import { explodeItemsForFulfillment } from "@/lib/kit-fulfillment";
import {
  notifyAccountsStockTransfer,
  notifyCrossCompanyTransferApprovalNeeded,
} from "@/lib/notification-service";
import { ROLES } from "@/lib/rbac";
import { addNonSerialStock, deductNonSerialStock } from "@/lib/transfer-service";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ShortfallLine = {
  productId: string;
  displayName: string;
  serialTracking: boolean;
  remainingQty: number;
  availableInPiCompany: number;
  shortfallQty: number;
};

export type CompanyAvailability = {
  companyId: string;
  companyCode: string;
  companyName: string;
  lines: Array<{
    productId: string;
    availableQty: number;
    sufficient: boolean;
  }>;
  canCoverAll: boolean;
};

export type DispatchTodayStockCheck = {
  piId: string;
  piCompanyId: string;
  hasShortfall: boolean;
  lines: ShortfallLine[];
  candidateCompanies: CompanyAvailability[];
  activePlan: SerializedPlan | null;
};

export type SerializedPlan = {
  id: string;
  status: PiCrossCompanyTransferPlanStatus;
  fromCompany: { id: string; code: string; name: string };
  toCompany: { id: string; code: string; name: string };
  lines: Array<{
    productId: string;
    displayName: string;
    qty: number;
    actualQty: number;
    unitPurchaseCost: number;
    serials: Array<{
      serialId: string;
      serialNumber: string;
      unitPurchaseCost: number;
    }>;
  }>;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  inventoryTransferId: string | null;
  dispatchId: string | null;
};

const planInclude = {
  fromCompany: { select: { id: true, code: true, name: true } },
  toCompany: { select: { id: true, code: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: { select: { id: true, displayName: true, serialTracking: true } },
      serials: {
        include: {
          serial: { select: { id: true, serialNumber: true } },
        },
      },
    },
  },
} satisfies Prisma.PiCrossCompanyTransferPlanInclude;

function serializePlan(
  plan: Prisma.PiCrossCompanyTransferPlanGetPayload<{ include: typeof planInclude }>,
): SerializedPlan {
  return {
    id: plan.id,
    status: plan.status,
    fromCompany: plan.fromCompany,
    toCompany: plan.toCompany,
    lines: plan.lines.map((line) => ({
      productId: line.productId,
      displayName: line.product.displayName,
      qty: decimalToNumber(line.qty),
      actualQty: decimalToNumber(line.actualQty),
      unitPurchaseCost: decimalToNumber(line.unitPurchaseCost),
      serials: line.serials.map((row) => ({
        serialId: row.serialId,
        serialNumber: row.serial.serialNumber,
        unitPurchaseCost: decimalToNumber(row.unitPurchaseCost),
      })),
    })),
    approvedBy: plan.approvedBy,
    approvedAt: plan.approvedAt?.toISOString() ?? null,
    inventoryTransferId: plan.inventoryTransferId,
    dispatchId: plan.dispatchId,
  };
}

export async function resolveSystemUserId(
  prisma: DbClient,
  fallbackUserId?: string,
): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
      roles: { some: { role: { name: ROLES.SUPER_ADMIN } } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (admin) return admin.id;
  // Auto transfers/swaps on dispatch confirm must not hard-fail when no Super Admin
  // account exists — attribute system lots/transfers to the acting user instead.
  if (fallbackUserId) return fallbackUserId;
  throw new Error("SYSTEM_USER_NOT_FOUND");
}

async function remainingFulfillmentLines(
  prisma: DbClient,
  piId: string,
): Promise<
  Array<{
    productId: string;
    displayName: string;
    serialTracking: boolean;
    remainingQty: number;
  }>
> {
  const pi = await prisma.proformaInvoice.findUniqueOrThrow({
    where: { id: piId },
    include: {
      items: {
        include: {
          product: { include: { category: true } },
        },
      },
    },
  });

  const remainingItems = pi.items
    .map((item) => {
      const remaining = getRemainingQty(
        decimalToNumber(item.qty),
        decimalToNumber(item.dispatchedQty),
      );
      return {
        productId: item.productId,
        qty: remaining,
        serialTracking: item.product.serialTracking,
        displayName: item.product.displayName,
        categoryName: item.product.category.name,
      };
    })
    .filter((item) => item.qty > 0);

  const exploded = await explodeItemsForFulfillment(prisma, remainingItems);
  const byProduct = new Map<
    string,
    { productId: string; displayName: string; serialTracking: boolean; remainingQty: number }
  >();

  for (const line of exploded) {
    const existing = byProduct.get(line.productId);
    if (existing) {
      existing.remainingQty += line.qty;
    } else {
      byProduct.set(line.productId, {
        productId: line.productId,
        displayName: line.displayName,
        serialTracking: line.serialTracking,
        remainingQty: line.qty,
      });
    }
  }

  return [...byProduct.values()];
}

export async function getCompanyAvailableQty(
  prisma: DbClient,
  companyId: string,
  productId: string,
): Promise<number> {
  const summary = await getProductStockSummary(
    prisma as PrismaClient,
    companyId,
    productId,
  );
  return summary.availableStock;
}

export async function computeDispatchTodayStockCheck(
  prisma: DbClient,
  input: { companyId: string; piId: string },
): Promise<DispatchTodayStockCheck> {
  const remaining = await remainingFulfillmentLines(prisma, input.piId);
  const lines: ShortfallLine[] = [];

  for (const item of remaining) {
    const availableInPiCompany = await getCompanyAvailableQty(
      prisma,
      input.companyId,
      item.productId,
    );
    const shortfallQty = Math.max(0, item.remainingQty - availableInPiCompany);
    lines.push({
      productId: item.productId,
      displayName: item.displayName,
      serialTracking: item.serialTracking,
      remainingQty: item.remainingQty,
      availableInPiCompany,
      shortfallQty,
    });
  }

  const shortfallLines = lines.filter((line) => line.shortfallQty > 0);
  const hasShortfall = shortfallLines.length > 0;

  const otherCompanies = await prisma.company.findMany({
    where: {
      id: { not: input.companyId },
      isPractice: false,
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const candidateCompanies: CompanyAvailability[] = [];
  for (const company of otherCompanies) {
    const companyLines = [];
    let canCoverAll = shortfallLines.length > 0;
    for (const line of shortfallLines) {
      const availableQty = await getCompanyAvailableQty(prisma, company.id, line.productId);
      const sufficient = availableQty >= line.shortfallQty;
      if (!sufficient) canCoverAll = false;
      companyLines.push({
        productId: line.productId,
        availableQty,
        sufficient,
      });
    }
    if (companyLines.some((row) => row.availableQty > 0)) {
      candidateCompanies.push({
        companyId: company.id,
        companyCode: company.code,
        companyName: company.name,
        lines: companyLines,
        canCoverAll,
      });
    }
  }

  const activePlanRow = await prisma.piCrossCompanyTransferPlan.findFirst({
    where: {
      piId: input.piId,
      status: {
        in: [
          PiCrossCompanyTransferPlanStatus.PENDING,
          PiCrossCompanyTransferPlanStatus.APPROVED,
        ],
      },
    },
    include: planInclude,
    orderBy: { createdAt: "desc" },
  });

  return {
    piId: input.piId,
    piCompanyId: input.companyId,
    hasShortfall,
    lines,
    candidateCompanies,
    activePlan: activePlanRow ? serializePlan(activePlanRow) : null,
  };
}

export async function validateSourceCoversShortfall(
  prisma: DbClient,
  input: {
    fromCompanyId: string;
    toCompanyId: string;
    shortfallLines: ShortfallLine[];
  },
) {
  if (input.fromCompanyId === input.toCompanyId) {
    throw new Error("INVALID_SOURCE_COMPANY");
  }
  const company = await prisma.company.findFirst({
    where: { id: input.fromCompanyId, isPractice: false },
  });
  if (!company) throw new Error("SOURCE_COMPANY_NOT_FOUND");

  for (const line of input.shortfallLines) {
    const available = await getCompanyAvailableQty(
      prisma,
      input.fromCompanyId,
      line.productId,
    );
    if (available < line.shortfallQty) {
      throw new Error("SOURCE_INSUFFICIENT_STOCK");
    }
  }
}

export async function createOrReplaceCrossCompanyPlan(
  tx: Prisma.TransactionClient,
  input: {
    piId: string;
    toCompanyId: string;
    fromCompanyId: string;
    shortfallLines: ShortfallLine[];
    requestedById: string;
    status: PiCrossCompanyTransferPlanStatus;
    approvedById?: string;
  },
) {
  const existingIds = (
    await tx.piCrossCompanyTransferPlan.findMany({
      where: { piId: input.piId },
      select: { id: true },
    })
  ).map((row) => row.id);

  await tx.piCrossCompanyTransferPlan.updateMany({
    where: {
      piId: input.piId,
      status: {
        in: [
          PiCrossCompanyTransferPlanStatus.PENDING,
          PiCrossCompanyTransferPlanStatus.APPROVED,
        ],
      },
    },
    data: { status: PiCrossCompanyTransferPlanStatus.SUPERSEDED },
  });

  if (existingIds.length > 0) {
    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
        status: ApprovalRequestStatus.PENDING,
        moduleId: { in: existingIds },
      },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        remarks: "Superseded by a new cross-company transfer plan",
      },
    });
  }

  return tx.piCrossCompanyTransferPlan.create({
    data: {
      piId: input.piId,
      fromCompanyId: input.fromCompanyId,
      toCompanyId: input.toCompanyId,
      status: input.status,
      requestedById: input.requestedById,
      approvedById: input.approvedById,
      approvedAt: input.status === PiCrossCompanyTransferPlanStatus.APPROVED ? new Date() : null,
      lines: {
        create: input.shortfallLines.map((line) => ({
          productId: line.productId,
          qty: line.shortfallQty,
        })),
      },
    },
    include: planInclude,
  });
}

export async function requestCrossCompanyPlanApproval(
  tx: Prisma.TransactionClient,
  input: {
    planId: string;
    piNo: string;
    companyId: string;
    requestedById: string;
    fromCompanyCode: string;
  },
) {
  await tx.approvalRequest.create({
    data: {
      moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
      moduleId: input.planId,
      requestedById: input.requestedById,
      status: ApprovalRequestStatus.PENDING,
      remarks: `Transfer shortfall stock from ${input.fromCompanyCode}`,
    },
  });

  await notifyCrossCompanyTransferApprovalNeeded(tx, {
    companyId: input.companyId,
    piNo: input.piNo,
    fromCompanyCode: input.fromCompanyCode,
  });
}

export async function approveCrossCompanyTransferPlan(
  prisma: PrismaClient,
  input: {
    companyId: string;
    planId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const plan = await prisma.piCrossCompanyTransferPlan.findFirst({
    where: {
      id: input.planId,
      toCompanyId: input.companyId,
      status: PiCrossCompanyTransferPlanStatus.PENDING,
    },
    include: {
      pi: true,
      fromCompany: { select: { code: true } },
    },
  });
  if (!plan) throw new Error("NO_PENDING_CROSS_COMPANY_TRANSFER");

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
      moduleId: plan.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pending) throw new Error("NO_PENDING_CROSS_COMPANY_TRANSFER");

  return prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks,
      },
    });

    const updated = await tx.piCrossCompanyTransferPlan.update({
      where: { id: plan.id },
      data: {
        status: PiCrossCompanyTransferPlanStatus.APPROVED,
        approvedById: input.approvedById,
        approvedAt: new Date(),
      },
      include: planInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "pi_cross_company_transfer_plans",
      recordId: plan.id,
      action: "UPDATE",
      newValue: {
        decision: "APPROVED",
        fromCompanyId: plan.fromCompanyId,
      },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: plan.pi.piNo,
    });

    return serializePlan(updated);
  });
}

export async function rejectCrossCompanyTransferPlan(
  prisma: PrismaClient,
  input: {
    companyId: string;
    planId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const plan = await prisma.piCrossCompanyTransferPlan.findFirst({
    where: {
      id: input.planId,
      toCompanyId: input.companyId,
      status: PiCrossCompanyTransferPlanStatus.PENDING,
    },
    include: { pi: true },
  });
  if (!plan) throw new Error("NO_PENDING_CROSS_COMPANY_TRANSFER");

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
      moduleId: plan.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pending) throw new Error("NO_PENDING_CROSS_COMPANY_TRANSFER");

  return prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: input.reason,
      },
    });

    await tx.piCrossCompanyTransferPlan.update({
      where: { id: plan.id },
      data: {
        status: PiCrossCompanyTransferPlanStatus.REJECTED,
        rejectionReason: input.reason,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "pi_cross_company_transfer_plans",
      recordId: plan.id,
      action: "UPDATE",
      newValue: {
        decision: "REJECTED",
        reason: input.reason,
      },
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: plan.pi.piNo,
    });

    return { ok: true };
  });
}

export async function getApprovedPlanForPi(prisma: DbClient, piId: string) {
  return prisma.piCrossCompanyTransferPlan.findFirst({
    where: {
      piId,
      status: PiCrossCompanyTransferPlanStatus.APPROVED,
    },
    include: planInclude,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Sister-company serials (e.g. ISE panels on a PCMV PI) are interchangeable when
 * the PI company still has enough of its own AVAILABLE units of that product.
 * In that case no shortfall transfer approval is required — ownership of matching
 * local serials is swapped on confirm so PI-company stock qty still drops.
 */
export async function foreignSerialsCoveredByLocalStock(
  prisma: DbClient,
  input: {
    piCompanyId: string;
    serialIds: string[];
    /** Serials already reserved on this DC stay out of the local pool. */
    excludeSerialIds?: string[];
  },
): Promise<boolean> {
  if (input.serialIds.length === 0) return true;

  const serials = await prisma.inventorySerial.findMany({
    where: { id: { in: input.serialIds } },
    include: {
      lot: { select: { companyId: true } },
    },
  });
  if (serials.length !== input.serialIds.length) {
    throw new Error("INVALID_SERIAL_SELECTION");
  }

  const foreignByProduct = new Map<string, number>();
  for (const serial of serials) {
    if (serial.lot.companyId === input.piCompanyId) continue;
    foreignByProduct.set(
      serial.productId,
      (foreignByProduct.get(serial.productId) ?? 0) + 1,
    );
  }
  if (foreignByProduct.size === 0) return true;

  const excludeIds = [
    ...new Set([...(input.excludeSerialIds ?? []), ...input.serialIds]),
  ];

  for (const [productId, foreignQty] of foreignByProduct) {
    const localAvailable = await prisma.inventorySerial.count({
      where: {
        productId,
        status: SerialStatus.AVAILABLE,
        lot: { companyId: input.piCompanyId },
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      },
    });
    if (localAvailable < foreignQty) return false;
  }

  return true;
}

/**
 * Sister-company serials are interchangeable (e.g. ISE panels on a PCMV PI).
 * Intentionally does not block dispatch — ownership is reconciled on confirm
 * via interchangeable serial swap (and shortfall auto-transfer when a plan exists).
 */
export async function assertSerialsMatchApprovedPlan(
  _prisma: DbClient,
  _input: {
    piId: string;
    piCompanyId: string;
    serialIds: string[];
  },
) {
  return;
}

function unitCostFromLot(lot: {
  unitPurchaseRate: Prisma.Decimal;
  totalPurchaseCost: Prisma.Decimal;
  quantity: Prisma.Decimal;
}): number {
  const unitRate = decimalToNumber(lot.unitPurchaseRate);
  if (unitRate > 0) return unitRate;
  const qty = decimalToNumber(lot.quantity);
  const total = decimalToNumber(lot.totalPurchaseCost);
  if (qty > 0 && total > 0) return total / qty;
  return 0;
}

/**
 * On DC confirm: book auto transfer+deliver for foreign-company stock,
 * with brief in→out on the PI company for audit. Skips normal receive UI.
 */
export async function completeCrossCompanyTransferOnDispatch(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    piId: string;
    piNo: string;
    dispatchId: string;
    dcNo: string;
    toWarehouseId: string;
    performedById: string;
    lines: Array<{
      productId: string;
      qty: number;
      serialTracking: boolean;
      serialIds: string[];
    }>;
  },
) {
  const plan = await getApprovedPlanForPi(tx, input.piId);
  if (!plan) return null;

  const foreignSerialIds: string[] = [];
  const foreignNonSerial: Array<{ productId: string; qty: number; fromWarehouseId: string }> =
    [];
  const planLineActual = new Map<string, number>();
  const serialCostRows: Array<{
    planLineId: string;
    serialId: string;
    unitPurchaseCost: number;
  }> = [];

  for (const line of input.lines) {
    if (line.serialTracking) {
      if (!line.serialIds.length) continue;
      const serials = await tx.inventorySerial.findMany({
        where: { id: { in: line.serialIds } },
        include: {
          lot: {
            select: {
              companyId: true,
              warehouseId: true,
              unitPurchaseRate: true,
              totalPurchaseCost: true,
              quantity: true,
            },
          },
        },
      });

      const foreign = serials.filter((s) => s.lot.companyId === plan.fromCompanyId);
      if (foreign.length === 0) continue;

      const planLine = plan.lines.find((row) => row.productId === line.productId);
      // No matching plan line — leave these serials for interchangeable swap; do not block.
      if (!planLine) continue;

      const planQty = decimalToNumber(planLine.qty);
      const already = planLineActual.get(planLine.id) ?? 0;
      const remainingPlanQty = Math.max(0, planQty - already);
      const take = foreign.slice(0, remainingPlanQty);
      if (take.length === 0) continue;

      planLineActual.set(planLine.id, already + take.length);

      for (const serial of take) {
        foreignSerialIds.push(serial.id);
        serialCostRows.push({
          planLineId: planLine.id,
          serialId: serial.id,
          unitPurchaseCost: unitCostFromLot(serial.lot),
        });
      }
    } else {
      const availableInPi = await getCompanyAvailableQty(tx, input.companyId, line.productId);
      const shortfall = Math.max(0, line.qty - availableInPi);
      if (shortfall <= 0) continue;

      const planLine = plan.lines.find((row) => row.productId === line.productId);
      // Shortfall without a covering plan line — skip auto-transfer; do not block confirm.
      if (!planLine || decimalToNumber(planLine.qty) < shortfall) {
        continue;
      }

      const lots = await tx.inventoryLot.findMany({
        where: {
          companyId: plan.fromCompanyId,
          productId: line.productId,
          status: LotStatus.CLOSED,
        },
        orderBy: { updatedAt: "desc" },
      });
      let remaining = shortfall;
      const byWarehouse = new Map<string, number>();
      for (const lot of lots) {
        if (remaining <= 0) break;
        const available = Math.max(
          0,
          decimalToNumber(lot.receivedQuantity) - decimalToNumber(lot.damagedQuantity),
        );
        if (available <= 0) continue;
        const take = Math.min(available, remaining);
        byWarehouse.set(lot.warehouseId, (byWarehouse.get(lot.warehouseId) ?? 0) + take);
        remaining -= take;
      }
      if (remaining > 0) throw new Error("SOURCE_INSUFFICIENT_STOCK");

      for (const [fromWarehouseId, qty] of byWarehouse) {
        foreignNonSerial.push({ productId: line.productId, qty, fromWarehouseId });
      }
      planLineActual.set(planLine.id, (planLineActual.get(planLine.id) ?? 0) + shortfall);
    }
  }

  if (foreignSerialIds.length === 0 && foreignNonSerial.length === 0) return null;

  type LineAgg = {
    productId: string;
    qty: number;
    serialIds: string[];
    unitCosts: number[];
  };
  type GroupAgg = { fromWarehouseId: string; lines: Map<string, LineAgg> };

  const transferGroups = new Map<string, GroupAgg>();

  const serials = foreignSerialIds.length
    ? await tx.inventorySerial.findMany({
        where: { id: { in: foreignSerialIds } },
        include: {
          lot: {
            select: {
              companyId: true,
              warehouseId: true,
              unitPurchaseRate: true,
              totalPurchaseCost: true,
              quantity: true,
            },
          },
        },
      })
    : [];

  for (const serial of serials) {
    const wh = serial.currentWarehouseId;
    const group = transferGroups.get(wh) ?? {
      fromWarehouseId: wh,
      lines: new Map(),
    };
    const line = group.lines.get(serial.productId) ?? {
      productId: serial.productId,
      qty: 0,
      serialIds: [],
      unitCosts: [],
    };
    line.qty += 1;
    line.serialIds.push(serial.id);
    line.unitCosts.push(unitCostFromLot(serial.lot));
    group.lines.set(serial.productId, line);
    transferGroups.set(wh, group);
  }

  for (const row of foreignNonSerial) {
    const group = transferGroups.get(row.fromWarehouseId) ?? {
      fromWarehouseId: row.fromWarehouseId,
      lines: new Map(),
    };
    const line = group.lines.get(row.productId) ?? {
      productId: row.productId,
      qty: 0,
      serialIds: [],
      unitCosts: [],
    };
    line.qty += row.qty;
    group.lines.set(row.productId, line);
    transferGroups.set(row.fromWarehouseId, group);
  }

  const systemUserId = await resolveSystemUserId(tx, input.performedById);
  const primaryGroup = [...transferGroups.values()][0]!;
  const transferNumber = await generateTransferNumber(tx, plan.fromCompanyId);

  const transfer = await tx.inventoryTransfer.create({
    data: {
      transferNumber,
      fromCompanyId: plan.fromCompanyId,
      toCompanyId: plan.toCompanyId,
      fromWarehouseId: primaryGroup.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      status: TransferStatus.RECEIVED,
      origin: TransferOrigin.DISPATCH_SHORTFALL,
      notes: `Auto transfer for ${input.piNo} / ${input.dcNo} (skip receive)`,
      proformaInvoiceId: input.piId,
      dispatchId: input.dispatchId,
      approvedById: plan.approvedById,
      createdById: systemUserId,
      dispatchedById: systemUserId,
      dispatchedAt: new Date(),
      receivedById: systemUserId,
      receivedAt: new Date(),
      lines: {
        create: [...primaryGroup.lines.values()].map((line) => ({
          productId: line.productId,
          qty: line.qty,
          receivedQty: line.qty,
          ...(line.serialIds.length
            ? {
                serials: {
                  create: line.serialIds.map((serialId) => ({ serialId })),
                },
              }
            : {}),
        })),
      },
    },
  });

  for (const group of [...transferGroups.values()].slice(1)) {
    for (const line of group.lines.values()) {
      await tx.inventoryTransferLine.create({
        data: {
          transferId: transfer.id,
          productId: line.productId,
          qty: line.qty,
          receivedQty: line.qty,
          ...(line.serialIds.length
            ? {
                serials: {
                  create: line.serialIds.map((serialId) => ({ serialId })),
                },
              }
            : {}),
        },
      });
    }
  }

  for (const group of transferGroups.values()) {
    for (const line of group.lines.values()) {
      if (line.serialIds.length) {
        const destLotNumber = await generateLotNumber(tx);
        const avgCost =
          line.unitCosts.length > 0
            ? line.unitCosts.reduce((a, b) => a + b, 0) / line.unitCosts.length
            : 0;
        const destLot = await tx.inventoryLot.create({
          data: {
            lotNumber: destLotNumber,
            companyId: plan.toCompanyId,
            warehouseId: input.toWarehouseId,
            purchaseInvoiceNo: systemPurchaseInvoiceNo(destLotNumber),
            purchaseDate: new Date(),
            productId: line.productId,
            quantity: line.qty,
            receivedQuantity: line.qty,
            unitPurchaseRate: avgCost,
            totalPurchaseCost: avgCost * line.qty,
            status: LotStatus.CLOSED,
            createdById: systemUserId,
            remarks: `Cross-company auto transfer ${transfer.transferNumber}`,
          },
        });

        await tx.inventorySerial.updateMany({
          where: { id: { in: line.serialIds } },
          data: {
            lotId: destLot.id,
            currentWarehouseId: input.toWarehouseId,
          },
        });
      } else {
        await deductNonSerialStock(tx, {
          companyId: plan.fromCompanyId,
          warehouseId: group.fromWarehouseId,
          productId: line.productId,
          qty: line.qty,
        });
        await addNonSerialStock(tx, {
          companyId: plan.toCompanyId,
          warehouseId: input.toWarehouseId,
          productId: line.productId,
          qty: line.qty,
          createdById: systemUserId,
        });
      }

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.TRANSFER,
          companyId: plan.fromCompanyId,
          productId: line.productId,
          qty: line.qty,
          fromWarehouseId: group.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          notes: [
            `Auto dispatched ${transfer.transferNumber}`,
            `${plan.fromCompany.name} → ${plan.toCompany.name}`,
            input.dcNo,
            input.piNo,
          ].join(" - "),
          createdById: systemUserId,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.TRANSFER,
          companyId: plan.toCompanyId,
          productId: line.productId,
          qty: line.qty,
          fromWarehouseId: group.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          notes: [
            `Auto received ${transfer.transferNumber}`,
            `${plan.fromCompany.name} → ${plan.toCompany.name}`,
            input.dcNo,
            input.piNo,
          ].join(" - "),
          createdById: systemUserId,
        },
      });
    }
  }

  for (const [planLineId, actualQty] of planLineActual) {
    const costs = serialCostRows
      .filter((row) => row.planLineId === planLineId)
      .map((row) => row.unitPurchaseCost);
    const avg = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
    await tx.piCrossCompanyTransferPlanLine.update({
      where: { id: planLineId },
      data: {
        actualQty,
        unitPurchaseCost: avg,
      },
    });
  }

  if (serialCostRows.length) {
    await tx.piCrossCompanyTransferPlanSerial.createMany({
      data: serialCostRows.map((row) => ({
        planLineId: row.planLineId,
        serialId: row.serialId,
        unitPurchaseCost: row.unitPurchaseCost,
      })),
      skipDuplicates: true,
    });
  }

  await tx.piCrossCompanyTransferPlan.update({
    where: { id: plan.id },
    data: {
      status: PiCrossCompanyTransferPlanStatus.COMPLETED,
      inventoryTransferId: transfer.id,
      dispatchId: input.dispatchId,
    },
  });

  await writeAuditLogTx(tx, {
    tableName: "inventory_transfers",
    recordId: transfer.id,
    action: "CREATE",
    newValue: {
      origin: TransferOrigin.DISPATCH_SHORTFALL,
      transferNumber: transfer.transferNumber,
      dcNo: input.dcNo,
      piNo: input.piNo,
    },
    performedBy: systemUserId,
    companyId: plan.toCompanyId,
    reference: transfer.transferNumber,
  });

  await notifyAccountsStockTransfer(tx, {
    companyId: plan.toCompanyId,
    transferNumber: transfer.transferNumber,
    piNo: input.piNo,
    dcNo: input.dcNo,
  });

  return transfer;
}

/**
 * When foreign-company serials are dispatched against a PI that still has enough
 * local stock (interchangeable), move matching local AVAILABLE serials onto the
 * foreign company so PI-company available qty drops and the sister company stays
 * net-flat (foreign serial dispatched, local serial transferred in).
 *
 * Runs after shortfall auto-transfer so plan-covered serials (already moved onto
 * the PI company) are ignored.
 */
export async function completeInterchangeableSerialSwapOnDispatch(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    piNo: string;
    dispatchId: string;
    dcNo: string;
    performedById: string;
    lines: Array<{
      productId: string;
      serialTracking: boolean;
      serialIds: string[];
    }>;
  },
) {
  const allSerialIds = input.lines.flatMap((line) =>
    line.serialTracking ? line.serialIds : [],
  );
  if (allSerialIds.length === 0) return null;

  const serials = await tx.inventorySerial.findMany({
    where: { id: { in: allSerialIds } },
    include: {
      lot: {
        select: {
          companyId: true,
          warehouseId: true,
          unitPurchaseRate: true,
          totalPurchaseCost: true,
          quantity: true,
        },
      },
    },
  });

  type SwapGroup = {
    fromCompanyId: string;
    productId: string;
    destWarehouseId: string;
    foreignCount: number;
  };
  const groups = new Map<string, SwapGroup>();

  for (const serial of serials) {
    if (serial.lot.companyId === input.companyId) continue;
    const key = `${serial.lot.companyId}:${serial.productId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.foreignCount += 1;
    } else {
      groups.set(key, {
        fromCompanyId: serial.lot.companyId,
        productId: serial.productId,
        destWarehouseId: serial.currentWarehouseId,
        foreignCount: 1,
      });
    }
  }

  if (groups.size === 0) return null;

  const systemUserId = await resolveSystemUserId(tx, input.performedById);
  const swappedSerialIds: string[] = [];

  for (const group of groups.values()) {
    const localSerials = await tx.inventorySerial.findMany({
      where: {
        productId: group.productId,
        status: SerialStatus.AVAILABLE,
        lot: { companyId: input.companyId },
        id: { notIn: allSerialIds },
      },
      include: {
        lot: {
          select: {
            unitPurchaseRate: true,
            totalPurchaseCost: true,
            quantity: true,
            warehouseId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: group.foreignCount,
    });

    // Swap as many local units as available so PI-company qty drops. Remaining
    // foreign serials stay on the sister company and are dispatched from there.
    if (localSerials.length === 0) continue;

    const swapQty = localSerials.length;
    const unitCosts = localSerials.map((row) => unitCostFromLot(row.lot));
    const avgCost =
      unitCosts.length > 0
        ? unitCosts.reduce((a, b) => a + b, 0) / unitCosts.length
        : 0;
    const destLotNumber = await generateLotNumber(tx);
    const destLot = await tx.inventoryLot.create({
      data: {
        lotNumber: destLotNumber,
        companyId: group.fromCompanyId,
        warehouseId: group.destWarehouseId,
        purchaseInvoiceNo: systemPurchaseInvoiceNo(destLotNumber),
        purchaseDate: new Date(),
        productId: group.productId,
        quantity: swapQty,
        receivedQuantity: swapQty,
        unitPurchaseRate: avgCost,
        totalPurchaseCost: avgCost * swapQty,
        status: LotStatus.CLOSED,
        createdById: systemUserId,
        remarks: `Interchangeable serial swap for ${input.piNo} / ${input.dcNo}`,
      },
    });

    const localIds = localSerials.map((row) => row.id);
    await tx.inventorySerial.updateMany({
      where: { id: { in: localIds } },
      data: {
        lotId: destLot.id,
        currentWarehouseId: group.destWarehouseId,
      },
    });
    swappedSerialIds.push(...localIds);

    const fromWarehouseId = localSerials[0]!.currentWarehouseId;

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.TRANSFER,
        companyId: input.companyId,
        productId: group.productId,
        qty: swapQty,
        fromWarehouseId,
        toWarehouseId: group.destWarehouseId,
        referenceType: "DISPATCH",
        referenceId: input.dispatchId,
        notes: `Interchangeable serial ownership swap out for ${input.dcNo}`,
        createdById: systemUserId,
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.TRANSFER,
        companyId: group.fromCompanyId,
        productId: group.productId,
        qty: swapQty,
        fromWarehouseId,
        toWarehouseId: group.destWarehouseId,
        referenceType: "DISPATCH",
        referenceId: input.dispatchId,
        notes: `Interchangeable serial ownership swap in for ${input.dcNo}`,
        createdById: systemUserId,
      },
    });
  }

  if (swappedSerialIds.length === 0) return null;

  await writeAuditLogTx(tx, {
    tableName: "inventory_serials",
    recordId: input.dispatchId,
    action: "UPDATE",
    newValue: {
      interchangeableSerialSwap: true,
      swappedSerialIds,
      dcNo: input.dcNo,
      piNo: input.piNo,
    },
    performedBy: input.performedById,
    companyId: input.companyId,
    reference: input.dcNo,
  });

  return { swappedSerialIds };
}

export async function prepareDispatchTodayCrossCompany(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    fromCompanyId?: string;
  },
) {
  const check = await computeDispatchTodayStockCheck(prisma, {
    companyId: input.companyId,
    piId: input.piId,
  });

  const shortfallLines = check.lines.filter((line) => line.shortfallQty > 0);
  if (shortfallLines.length === 0) {
    return { check, shortfallLines, needsPlan: false as const };
  }

  const coverable = check.candidateCompanies.some((c) => c.canCoverAll);
  if (!coverable) {
    throw new Error("STOCK_UNAVAILABLE");
  }

  if (!input.fromCompanyId) {
    throw new Error("SHORTFALL_SOURCE_REQUIRED");
  }

  await validateSourceCoversShortfall(prisma, {
    fromCompanyId: input.fromCompanyId,
    toCompanyId: input.companyId,
    shortfallLines,
  });

  return {
    check,
    shortfallLines,
    needsPlan: true as const,
    fromCompanyId: input.fromCompanyId,
  };
}

export async function listAccountsStockTransfers(
  prisma: PrismaClient,
  companyId: string,
) {
  const transfers = await prisma.inventoryTransfer.findMany({
    where: {
      OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }],
    },
    include: {
      fromCompany: { select: { id: true, code: true, name: true } },
      toCompany: { select: { id: true, code: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      proformaInvoice: { select: { id: true, piNo: true } },
      dispatch: { select: { id: true, dcNo: true } },
      crossCompanyPlan: {
        include: {
          approvedBy: { select: { id: true, name: true } },
          lines: {
            include: {
              product: { select: { displayName: true, serialTracking: true } },
              serials: {
                include: { serial: { select: { serialNumber: true } } },
              },
            },
          },
        },
      },
      lines: {
        include: {
          product: { select: { displayName: true, serialTracking: true } },
          serials: {
            include: { serial: { select: { serialNumber: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return transfers.map((transfer) => ({
    id: transfer.id,
    transferNumber: transfer.transferNumber,
    origin: transfer.origin,
    status: transfer.status,
    fromCompany: transfer.fromCompany,
    toCompany: transfer.toCompany,
    piNo: transfer.proformaInvoice?.piNo ?? null,
    dcNo: transfer.dispatch?.dcNo ?? null,
    approvedBy: transfer.approvedBy ?? transfer.crossCompanyPlan?.approvedBy ?? null,
    createdBy: transfer.createdBy,
    createdAt: transfer.createdAt.toISOString(),
    dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
    receivedAt: transfer.receivedAt?.toISOString() ?? null,
    lines: transfer.lines.map((line) => {
      const planLine = transfer.crossCompanyPlan?.lines.find(
        (row) => row.productId === line.productId,
      );
      return {
        productName: line.product.displayName,
        qty: decimalToNumber(line.qty),
        unitPurchaseCost: planLine ? decimalToNumber(planLine.unitPurchaseCost) : null,
        serials: line.serials.map((row) => row.serial.serialNumber),
      };
    }),
  }));
}

export { serializePlan };
