import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  IncomingLotChangeStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber, normalizePurchaseInvoiceNo } from "@/lib/inventory";
import {
  applyIncomingLotReceiveEdits,
  canModifyIncomingLot,
  findDuplicatePurchaseInvoice,
} from "@/lib/inventory-service";

const changeRequestInclude = {
  lot: {
    select: {
      id: true,
      lotNumber: true,
      warehouseId: true,
      status: true,
      receivedQuantity: true,
      damagedQuantity: true,
      warehouse: { select: { name: true } },
    },
  },
  previousProduct: { select: { id: true, displayName: true } },
  proposedProduct: { select: { id: true, displayName: true } },
  requestedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;

type ChangeRequestRow = Prisma.IncomingLotChangeRequestGetPayload<{
  include: typeof changeRequestInclude;
}>;

function serializeChangeRequest(row: ChangeRequestRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    lotId: row.lotId,
    lotNumber: row.lot.lotNumber,
    warehouseName: row.lot.warehouse.name,
    previousProductId: row.previousProductId,
    previousProductName: row.previousProduct.displayName,
    previousQuantity: decimalToNumber(row.previousQuantity),
    previousPurchaseInvoiceNo: row.previousPurchaseInvoiceNo,
    proposedProductId: row.proposedProductId,
    proposedProductName: row.proposedProduct.displayName,
    proposedQuantity: decimalToNumber(row.proposedQuantity),
    proposedPurchaseInvoiceNo: row.proposedPurchaseInvoiceNo,
    status: row.status,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionRemarks: row.decisionRemarks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type SerializedIncomingLotChangeRequest = NonNullable<
  ReturnType<typeof serializeChangeRequest>
>;

export async function getPendingIncomingLotChangeForLot(
  prisma: PrismaClient,
  lotId: string,
  companyId: string,
) {
  const row = await prisma.incomingLotChangeRequest.findFirst({
    where: { lotId, companyId, status: IncomingLotChangeStatus.PENDING },
    include: changeRequestInclude,
    orderBy: { createdAt: "desc" },
  });
  return serializeChangeRequest(row);
}

export async function submitIncomingLotReceiveEdit(
  prisma: PrismaClient,
  input: {
    lotId: string;
    companyId: string;
    productId: string;
    quantity: number;
    purchaseInvoiceNo: string;
    requestedById: string;
    /** When true, apply immediately (Purchase / Super Admin). */
    applyImmediately: boolean;
  },
) {
  const lot = await prisma.inventoryLot.findFirst({
    where: { id: input.lotId, companyId: input.companyId },
    include: { product: { select: { displayName: true } } },
  });
  if (!lot) throw new Error("NOT_FOUND");
  if (!canModifyIncomingLot(lot)) throw new Error("LOT_NOT_EDITABLE");

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");
  if (input.quantity <= 0) throw new Error("INVALID_QUANTITY");

  const purchaseInvoiceNo = normalizePurchaseInvoiceNo(input.purchaseInvoiceNo);
  if (!purchaseInvoiceNo) throw new Error("PURCHASE_INVOICE_REQUIRED");

  const duplicateInvoice = await findDuplicatePurchaseInvoice(
    prisma,
    purchaseInvoiceNo,
    lot.id,
  );
  if (duplicateInvoice) throw new Error("DUPLICATE_PURCHASE_INVOICE");

  const previousQuantity = decimalToNumber(lot.quantity);
  const unchanged =
    lot.productId === input.productId &&
    previousQuantity === input.quantity &&
    normalizePurchaseInvoiceNo(lot.purchaseInvoiceNo) === purchaseInvoiceNo;
  if (unchanged) throw new Error("NO_CHANGES");

  if (input.applyImmediately) {
    const updated = await prisma.$transaction((tx) =>
      applyIncomingLotReceiveEdits(tx, lot.id, input.companyId, {
        productId: input.productId,
        quantity: input.quantity,
        purchaseInvoiceNo,
        updatedById: input.requestedById,
      }),
    );
    return { mode: "APPLIED" as const, lot: updated, changeRequest: null };
  }

  const existingPending = await prisma.incomingLotChangeRequest.findFirst({
    where: {
      lotId: lot.id,
      companyId: input.companyId,
      status: IncomingLotChangeStatus.PENDING,
    },
  });
  if (existingPending) throw new Error("PENDING_CHANGE_EXISTS");

  return prisma.$transaction(async (tx) => {
    const changeRequest = await tx.incomingLotChangeRequest.create({
      data: {
        companyId: input.companyId,
        lotId: lot.id,
        previousProductId: lot.productId,
        previousQuantity: lot.quantity,
        previousPurchaseInvoiceNo: lot.purchaseInvoiceNo,
        proposedProductId: input.productId,
        proposedQuantity: input.quantity,
        proposedPurchaseInvoiceNo: purchaseInvoiceNo,
        status: IncomingLotChangeStatus.PENDING,
        requestedById: input.requestedById,
      },
      include: changeRequestInclude,
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.INCOMING_LOT_EDIT,
        moduleId: changeRequest.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: `Receive edit for ${lot.lotNumber}: product/qty/invoice`,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "incoming_lot_change_requests",
      recordId: changeRequest.id,
      action: "CREATE",
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: lot.lotNumber,
      newValue: {
        proposedProductId: input.productId,
        proposedQuantity: input.quantity,
        proposedPurchaseInvoiceNo: purchaseInvoiceNo,
      },
    });

    return {
      mode: "PENDING_APPROVAL" as const,
      lot: null,
      changeRequest: serializeChangeRequest(changeRequest),
    };
  });
}

export async function approveIncomingLotChangeRequest(
  prisma: PrismaClient,
  input: {
    companyId: string;
    changeRequestId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const changeRequest = await prisma.incomingLotChangeRequest.findFirst({
    where: { id: input.changeRequestId, companyId: input.companyId },
    include: { lot: true },
  });
  if (!changeRequest) throw new Error("NOT_FOUND");
  if (changeRequest.status !== IncomingLotChangeStatus.PENDING) {
    throw new Error("INVALID_STATUS");
  }
  if (!canModifyIncomingLot(changeRequest.lot)) throw new Error("LOT_NOT_EDITABLE");

  return prisma.$transaction(async (tx) => {
    await applyIncomingLotReceiveEdits(tx, changeRequest.lotId, input.companyId, {
      productId: changeRequest.proposedProductId,
      quantity: decimalToNumber(changeRequest.proposedQuantity),
      purchaseInvoiceNo: changeRequest.proposedPurchaseInvoiceNo,
      updatedById: input.approvedById,
    });

    const updated = await tx.incomingLotChangeRequest.update({
      where: { id: changeRequest.id },
      data: {
        status: IncomingLotChangeStatus.APPROVED,
        decidedById: input.approvedById,
        decidedAt: new Date(),
        decisionRemarks: input.remarks?.trim() || null,
      },
      include: changeRequestInclude,
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.INCOMING_LOT_EDIT,
        moduleId: changeRequest.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks?.trim() || undefined,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "incoming_lot_change_requests",
      recordId: changeRequest.id,
      action: "APPROVE",
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: changeRequest.lot.lotNumber,
      newValue: { status: IncomingLotChangeStatus.APPROVED },
    });

    return serializeChangeRequest(updated);
  });
}

export async function rejectIncomingLotChangeRequest(
  prisma: PrismaClient,
  input: {
    companyId: string;
    changeRequestId: string;
    rejectedById: string;
    remarks: string;
  },
) {
  const reason = input.remarks.trim();
  if (!reason) throw new Error("REASON_REQUIRED");

  const changeRequest = await prisma.incomingLotChangeRequest.findFirst({
    where: { id: input.changeRequestId, companyId: input.companyId },
    include: { lot: { select: { lotNumber: true } } },
  });
  if (!changeRequest) throw new Error("NOT_FOUND");
  if (changeRequest.status !== IncomingLotChangeStatus.PENDING) {
    throw new Error("INVALID_STATUS");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.incomingLotChangeRequest.update({
      where: { id: changeRequest.id },
      data: {
        status: IncomingLotChangeStatus.REJECTED,
        decidedById: input.rejectedById,
        decidedAt: new Date(),
        decisionRemarks: reason,
      },
      include: changeRequestInclude,
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.INCOMING_LOT_EDIT,
        moduleId: changeRequest.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: reason,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "incoming_lot_change_requests",
      recordId: changeRequest.id,
      action: "CANCEL",
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: changeRequest.lot.lotNumber,
      newValue: { status: IncomingLotChangeStatus.REJECTED, reason },
    });

    return serializeChangeRequest(updated);
  });
}
