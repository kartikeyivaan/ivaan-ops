import {
  CapacityUnit,
  Prisma,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber, getFinancialYear } from "@/lib/inventory";
import { createNotification } from "@/lib/notification-service";
import {
  MANAGER_SETTABLE_STATUSES,
  PURCHASE_REQUEST_PRIORITY_LABELS,
  PURCHASE_REQUEST_STATUS_LABELS,
  TERMINAL_PURCHASE_REQUEST_STATUSES,
} from "@/lib/purchase-request-constants";
import { createProduct } from "@/lib/product-service";
import { ROLES } from "@/lib/rbac";

const requestInclude = {
  company: { select: { id: true, name: true, code: true } },
  warehouse: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          capacity: true,
          capacityUnit: true,
          gstRate: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
        },
      },
      lots: {
        select: {
          id: true,
          lotNumber: true,
          quantity: true,
          status: true,
          purchaseInvoiceNo: true,
        },
        orderBy: { createdAt: "desc" as const },
      },
    },
  },
} as const;

type RequestRecord = Prisma.PurchaseRequestGetPayload<{ include: typeof requestInclude }>;

export type SerializedPurchaseRequestLine = {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  brandName: string;
  capacity: number;
  capacityUnit: CapacityUnit;
  gstRate: number;
  requestedQty: number;
  fulfilledQty: number;
  remainingQty: number;
  targetDate: string | null;
  priority: PurchaseRequestPriority;
  priorityLabel: string;
  remarks: string | null;
  sortOrder: number;
  lots: Array<{
    id: string;
    lotNumber: string;
    quantity: number;
    status: string;
    purchaseInvoiceNo: string;
  }>;
};

export type SerializedPurchaseRequest = {
  id: string;
  requestNumber: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  warehouseId: string | null;
  warehouseName: string | null;
  status: PurchaseRequestStatus;
  statusLabel: string;
  priority: PurchaseRequestPriority;
  priorityLabel: string;
  remarks: string | null;
  statusRemarks: string | null;
  requestedById: string;
  requestedByName: string;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  lines: SerializedPurchaseRequestLine[];
};

export function serializePurchaseRequest(row: RequestRecord): SerializedPurchaseRequest {
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    companyId: row.companyId,
    companyName: row.company.name,
    companyCode: row.company.code,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse?.name ?? null,
    status: row.status,
    statusLabel: PURCHASE_REQUEST_STATUS_LABELS[row.status],
    priority: row.priority,
    priorityLabel: PURCHASE_REQUEST_PRIORITY_LABELS[row.priority],
    remarks: row.remarks,
    statusRemarks: row.statusRemarks,
    requestedById: row.requestedById,
    requestedByName: row.requestedBy.name,
    updatedByName: row.updatedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lineCount: row.lines.length,
    lines: row.lines.map((line) => {
      const requestedQty = decimalToNumber(line.requestedQty);
      const fulfilledQty = decimalToNumber(line.fulfilledQty);
      return {
        id: line.id,
        productId: line.productId,
        productName: line.product.displayName,
        categoryName: line.categoryName,
        brandName: line.brandName,
        capacity: decimalToNumber(line.product.capacity),
        capacityUnit: line.product.capacityUnit,
        gstRate: decimalToNumber(line.product.gstRate),
        requestedQty,
        fulfilledQty,
        remainingQty: Math.max(0, requestedQty - fulfilledQty),
        targetDate: line.targetDate?.toISOString().slice(0, 10) ?? null,
        priority: line.priority,
        priorityLabel: PURCHASE_REQUEST_PRIORITY_LABELS[line.priority],
        remarks: line.remarks,
        sortOrder: line.sortOrder,
        lots: line.lots.map((lot) => ({
          id: lot.id,
          lotNumber: lot.lotNumber,
          quantity: decimalToNumber(lot.quantity),
          status: lot.status,
          purchaseInvoiceNo: lot.purchaseInvoiceNo,
        })),
      };
    }),
  };
}

async function generatePurchaseRequestNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  companyCode: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "PURCHASE_REQUEST";
  const existing = await prisma.documentSequence.findUnique({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
  });

  const nextSeq = (existing?.lastSequence ?? 0) + 1;

  await prisma.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
    create: {
      companyId,
      documentType: docType,
      financialYear: fy,
      lastSequence: nextSeq,
    },
    update: { lastSequence: nextSeq },
  });

  return `${companyCode}-PR-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

function highestPriority(
  priorities: PurchaseRequestPriority[],
): PurchaseRequestPriority {
  const rank: Record<PurchaseRequestPriority, number> = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    URGENT: 4,
  };
  return priorities.reduce(
    (best, current) => (rank[current] > rank[best] ? current : best),
    PurchaseRequestPriority.LOW,
  );
}

export type NewProductInput = {
  categoryId: string;
  brandName: string;
  technologyName?: string;
  capacity: number;
  capacityUnit: CapacityUnit;
  gstRate: number;
  hsn?: string;
};

export type CreatePurchaseRequestLineInput = {
  productId?: string;
  newProduct?: NewProductInput;
  requestedQty: number;
  targetDate?: string | null;
  priority?: PurchaseRequestPriority;
  remarks?: string | null;
};

export async function listPurchaseRequests(
  prisma: PrismaClient,
  input: {
    companyIds: string[];
    status?: PurchaseRequestStatus;
    requestedById?: string;
  },
) {
  if (!input.companyIds.length) return [];

  const rows = await prisma.purchaseRequest.findMany({
    where: {
      companyId: { in: input.companyIds },
      ...(input.status ? { status: input.status } : {}),
      ...(input.requestedById ? { requestedById: input.requestedById } : {}),
    },
    include: requestInclude,
    orderBy: [{ createdAt: "desc" }],
  });

  return rows.map(serializePurchaseRequest);
}

export async function getPurchaseRequest(prisma: PrismaClient, id: string) {
  const row = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  return row ? serializePurchaseRequest(row) : null;
}

async function notifyPurchaseTeam(
  client: PrismaClient | Prisma.TransactionClient,
  input: { companyId: string; requestNumber: string; requestedByName: string },
) {
  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId: input.companyId } },
      roles: {
        some: { role: { name: { in: [ROLES.PURCHASE, ROLES.SUPER_ADMIN] } } },
      },
    },
    select: { id: true },
  });
  if (!users.length) return;
  await client.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: "New purchase request",
      message: `${input.requestNumber} raised by ${input.requestedByName}.`,
      module: "purchase_request",
    })),
  });
}

export async function createPurchaseRequest(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId?: string | null;
    remarks?: string | null;
    requestedById: string;
    requestedByName: string;
    lines: CreatePurchaseRequestLineInput[];
  },
) {
  if (!input.lines.length) throw new Error("LINES_REQUIRED");

  const company = await prisma.company.findFirst({
    where: { id: input.companyId, isActive: true },
    select: { id: true, code: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  if (input.warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: input.warehouseId,
        companyId: input.companyId,
        isActive: true,
      },
    });
    if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");
  }

  const resolvedLines: Array<{
    productId: string;
    categoryName: string;
    brandName: string;
    requestedQty: number;
    targetDate: Date | null;
    priority: PurchaseRequestPriority;
    remarks: string | null;
    sortOrder: number;
  }> = [];

  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index];
    if (line.requestedQty <= 0) throw new Error("INVALID_QUANTITY");

    let productId = line.productId;
    if (!productId && line.newProduct) {
      const created = await createProduct(prisma, {
        categoryId: line.newProduct.categoryId,
        brandName: line.newProduct.brandName,
        technologyName: line.newProduct.technologyName,
        capacity: line.newProduct.capacity,
        capacityUnit: line.newProduct.capacityUnit,
        gstRate: line.newProduct.gstRate,
        hsn: line.newProduct.hsn,
        isActive: true,
      });
      productId = created.id;
    }
    if (!productId) throw new Error("PRODUCT_REQUIRED");

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    });
    if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");
    if (product.category.name === "Kit") throw new Error("KIT_NOT_STOCKABLE");

    resolvedLines.push({
      productId: product.id,
      categoryName: product.category.name,
      brandName: product.brand.name,
      requestedQty: line.requestedQty,
      targetDate: line.targetDate ? new Date(line.targetDate) : null,
      priority: line.priority ?? PurchaseRequestPriority.NORMAL,
      remarks: line.remarks?.trim() || null,
      sortOrder: index,
    });
  }

  const headerPriority = highestPriority(resolvedLines.map((line) => line.priority));

  const created = await prisma.$transaction(async (tx) => {
    const requestNumber = await generatePurchaseRequestNumber(tx, company.id, company.code);
    const request = await tx.purchaseRequest.create({
      data: {
        requestNumber,
        companyId: company.id,
        warehouseId: input.warehouseId ?? null,
        status: PurchaseRequestStatus.OPEN,
        priority: headerPriority,
        remarks: input.remarks?.trim() || null,
        requestedById: input.requestedById,
        updatedById: input.requestedById,
        lines: {
          create: resolvedLines.map((line) => ({
            productId: line.productId,
            categoryName: line.categoryName,
            brandName: line.brandName,
            requestedQty: line.requestedQty,
            targetDate: line.targetDate,
            priority: line.priority,
            remarks: line.remarks,
            sortOrder: line.sortOrder,
          })),
        },
      },
      include: requestInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "purchase_requests",
      recordId: request.id,
      action: "CREATE",
      performedBy: input.requestedById,
      companyId: company.id,
      newValue: {
        requestNumber: request.requestNumber,
        lineCount: resolvedLines.length,
        priority: headerPriority,
      },
    });

    await notifyPurchaseTeam(tx, {
      companyId: company.id,
      requestNumber: request.requestNumber,
      requestedByName: input.requestedByName,
    });

    return request;
  });

  return serializePurchaseRequest(created);
}

export async function updatePurchaseRequestStatus(
  prisma: PrismaClient,
  input: {
    id: string;
    status: PurchaseRequestStatus;
    statusRemarks?: string | null;
    updatedById: string;
    asManager: boolean;
    actorUserId: string;
  },
) {
  const existing = await prisma.purchaseRequest.findUnique({
    where: { id: input.id },
    include: requestInclude,
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (TERMINAL_PURCHASE_REQUEST_STATUSES.includes(existing.status)) {
    throw new Error("ALREADY_CLOSED");
  }

  if (
    existing.status === PurchaseRequestStatus.PARTIALLY_FULFILLED ||
    existing.status === PurchaseRequestStatus.FULFILLED
  ) {
    if (
      input.status !== PurchaseRequestStatus.CANCELLED &&
      !MANAGER_SETTABLE_STATUSES.includes(input.status)
    ) {
      // fulfillment statuses are system-driven; managers can still cancel/reject early stages only
    }
  }

  if (input.asManager) {
    if (!MANAGER_SETTABLE_STATUSES.includes(input.status)) {
      throw new Error("INVALID_STATUS");
    }
    if (
      (input.status === PurchaseRequestStatus.REJECTED ||
        input.status === PurchaseRequestStatus.CANCELLED) &&
      !input.statusRemarks?.trim()
    ) {
      throw new Error("REMARKS_REQUIRED");
    }
  } else {
    if (input.status !== PurchaseRequestStatus.CANCELLED) {
      throw new Error("FORBIDDEN");
    }
    if (existing.requestedById !== input.actorUserId) {
      throw new Error("FORBIDDEN");
    }
    if (existing.status !== PurchaseRequestStatus.OPEN) {
      throw new Error("CANNOT_CANCEL");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.purchaseRequest.update({
      where: { id: input.id },
      data: {
        status: input.status,
        statusRemarks: input.statusRemarks?.trim() || null,
        updatedById: input.updatedById,
      },
      include: requestInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "purchase_requests",
      recordId: row.id,
      action: "UPDATE",
      performedBy: input.updatedById,
      companyId: row.companyId,
      oldValue: { status: existing.status },
      newValue: { status: row.status, statusRemarks: row.statusRemarks },
    });

    if (existing.requestedById !== input.updatedById) {
      await createNotification(
        {
          userId: existing.requestedById,
          title: "Purchase request updated",
          message: `${row.requestNumber} is now ${PURCHASE_REQUEST_STATUS_LABELS[row.status]}.`,
          module: "purchase_request",
        },
        tx,
      );
    }

    return row;
  });

  return serializePurchaseRequest(updated);
}

export function deriveFulfillmentStatus(
  lines: Array<{ requestedQty: number; fulfilledQty: number }>,
): PurchaseRequestStatus {
  const totalRequested = lines.reduce((sum, line) => sum + line.requestedQty, 0);
  const totalFulfilled = lines.reduce((sum, line) => sum + line.fulfilledQty, 0);
  if (totalFulfilled <= 0) return PurchaseRequestStatus.ORDERED;
  if (totalFulfilled + 0.0001 >= totalRequested) return PurchaseRequestStatus.FULFILLED;
  return PurchaseRequestStatus.PARTIALLY_FULFILLED;
}

export async function applyIncomingFulfillment(
  tx: Prisma.TransactionClient,
  input: {
    purchaseRequestLineId: string;
    quantity: number;
    updatedById: string;
  },
) {
  const line = await tx.purchaseRequestLine.findUnique({
    where: { id: input.purchaseRequestLineId },
    include: {
      purchaseRequest: true,
    },
  });
  if (!line) throw new Error("PURCHASE_REQUEST_LINE_NOT_FOUND");

  if (
    line.purchaseRequest.status === PurchaseRequestStatus.REJECTED ||
    line.purchaseRequest.status === PurchaseRequestStatus.CANCELLED
  ) {
    throw new Error("PURCHASE_REQUEST_CLOSED");
  }

  const requestedQty = decimalToNumber(line.requestedQty);
  const currentFulfilled = decimalToNumber(line.fulfilledQty);
  const nextFulfilled = currentFulfilled + input.quantity;
  if (nextFulfilled - requestedQty > 0.0001) {
    throw new Error("FULFILLMENT_EXCEEDS_REQUEST");
  }

  await tx.purchaseRequestLine.update({
    where: { id: line.id },
    data: { fulfilledQty: nextFulfilled },
  });

  const refreshedLines = await tx.purchaseRequestLine.findMany({
    where: { purchaseRequestId: line.purchaseRequestId },
    select: { requestedQty: true, fulfilledQty: true },
  });

  const fulfillmentStatus = deriveFulfillmentStatus(
    refreshedLines.map((row) => ({
      requestedQty: decimalToNumber(row.requestedQty),
      fulfilledQty: decimalToNumber(row.fulfilledQty),
    })),
  );

  await tx.purchaseRequest.update({
    where: { id: line.purchaseRequestId },
    data: {
      status: fulfillmentStatus,
      updatedById: input.updatedById,
    },
  });
}
