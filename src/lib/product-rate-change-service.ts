import {
  ProductRateChangeBatchStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import {
  PRODUCT_RATE_CHANGE_REQUIRED_APPROVALS,
  canApproveProductRateChange,
} from "@/lib/product-rate-change-permissions";
import { addProductPrice } from "@/lib/product-service";
import { isProductPriceEffectiveOn } from "@/lib/quotations";
import type { ProductRateChangeLineInput } from "@/lib/validations";

const batchInclude = {
  createdBy: { select: { id: true, name: true } },
  rejectedBy: { select: { id: true, name: true } },
  signOffs: {
    orderBy: { createdAt: "asc" as const },
    include: { user: { select: { id: true, name: true } } },
  },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { product: { select: { id: true, displayName: true } } },
  },
} satisfies Prisma.ProductRateChangeBatchInclude;

type BatchRecord = Prisma.ProductRateChangeBatchGetPayload<{ include: typeof batchInclude }>;

export function validateRateChangeLines(lines: ProductRateChangeLineInput[]): string | null {
  if (lines.length === 0) return "Add at least one product line.";
  const productIds = new Set<string>();
  for (const line of lines) {
    if (productIds.has(line.productId)) {
      return "Each product can appear only once in a batch.";
    }
    productIds.add(line.productId);
    if (line.minimumPrice > line.standardPrice) {
      return "Minimum price cannot exceed standard price.";
    }
  }
  return null;
}

async function generateRequestNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.productRateChangeBatch.count();
  return `PRC-${String(count + 1).padStart(5, "0")}`;
}

async function resolveCurrentProductPrice(
  tx: Prisma.TransactionClient,
  productId: string,
) {
  const prices = await tx.productPrice.findMany({
    where: { productId },
    orderBy: { effectiveFrom: "desc" },
  });
  const now = new Date();
  return prices.find((price) => isProductPriceEffectiveOn(price, now)) ?? null;
}

function serializeLine(line: BatchRecord["lines"][number]) {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.product.displayName,
    previousStandardPrice: decimalToNumber(line.previousStandardPrice),
    previousMinimumPrice: decimalToNumber(line.previousMinimumPrice),
    newStandardPrice: decimalToNumber(line.newStandardPrice),
    newMinimumPrice: decimalToNumber(line.newMinimumPrice),
    sortOrder: line.sortOrder,
  };
}

export function serializeProductRateChangeBatch(batch: BatchRecord) {
  return {
    id: batch.id,
    requestNumber: batch.requestNumber,
    status: batch.status,
    createdById: batch.createdById,
    createdByName: batch.createdBy.name,
    submittedAt: batch.submittedAt?.toISOString() ?? null,
    appliedAt: batch.appliedAt?.toISOString() ?? null,
    rejectedAt: batch.rejectedAt?.toISOString() ?? null,
    rejectedByName: batch.rejectedBy?.name ?? null,
    rejectionReason: batch.rejectionReason,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    approvalCount: batch.signOffs.length,
    requiredApprovals: PRODUCT_RATE_CHANGE_REQUIRED_APPROVALS,
    signOffs: batch.signOffs.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      createdAt: row.createdAt.toISOString(),
    })),
    lines: batch.lines.map(serializeLine),
  };
}

export type ProductRateChangeBatchDto = ReturnType<typeof serializeProductRateChangeBatch>;

function assertEditable(status: ProductRateChangeBatchStatus) {
  if (status !== ProductRateChangeBatchStatus.DRAFT && status !== ProductRateChangeBatchStatus.REJECTED) {
    throw new Error("NOT_EDITABLE");
  }
}

export async function createProductRateChangeBatch(
  prisma: PrismaClient,
  input: { createdById: string; lines: ProductRateChangeLineInput[] },
) {
  const validationError = validateRateChangeLines(input.lines);
  if (validationError) throw new Error(`VALIDATION:${validationError}`);

  return prisma.$transaction(async (tx) => {
    const requestNumber = await generateRequestNumber(tx);
    const batch = await tx.productRateChangeBatch.create({
      data: {
        requestNumber,
        status: ProductRateChangeBatchStatus.DRAFT,
        createdById: input.createdById,
        lines: {
          create: input.lines.map((line, index) => ({
            productId: line.productId,
            previousStandardPrice: 0,
            previousMinimumPrice: 0,
            newStandardPrice: line.standardPrice,
            newMinimumPrice: line.minimumPrice,
            sortOrder: index,
          })),
        },
      },
      include: batchInclude,
    });
    return serializeProductRateChangeBatch(batch);
  });
}

export async function updateProductRateChangeBatch(
  prisma: PrismaClient,
  input: { batchId: string; lines: ProductRateChangeLineInput[] },
) {
  const validationError = validateRateChangeLines(input.lines);
  if (validationError) throw new Error(`VALIDATION:${validationError}`);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.productRateChangeBatch.findUnique({
      where: { id: input.batchId },
    });
    if (!existing) throw new Error("NOT_FOUND");
    assertEditable(existing.status);

    await tx.productRateChangeLine.deleteMany({ where: { batchId: input.batchId } });
    await tx.productRateChangeLine.createMany({
      data: input.lines.map((line, index) => ({
        batchId: input.batchId,
        productId: line.productId,
        previousStandardPrice: 0,
        previousMinimumPrice: 0,
        newStandardPrice: line.standardPrice,
        newMinimumPrice: line.minimumPrice,
        sortOrder: index,
      })),
    });

    const batch = await tx.productRateChangeBatch.update({
      where: { id: input.batchId },
      data: {
        rejectionReason: null,
        rejectedAt: null,
        rejectedById: null,
      },
      include: batchInclude,
    });
    return serializeProductRateChangeBatch(batch);
  });
}

export async function getProductRateChangeBatch(prisma: PrismaClient, batchId: string) {
  const batch = await prisma.productRateChangeBatch.findUnique({
    where: { id: batchId },
    include: batchInclude,
  });
  if (!batch) return null;
  return serializeProductRateChangeBatch(batch);
}

export async function listProductRateChangeBatches(
  prisma: PrismaClient,
  input: { viewerId: string; viewAll: boolean },
) {
  const batches = await prisma.productRateChangeBatch.findMany({
    where: input.viewAll ? undefined : { createdById: input.viewerId },
    include: batchInclude,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return batches.map(serializeProductRateChangeBatch);
}

export async function submitProductRateChangeBatch(
  prisma: PrismaClient,
  batchId: string,
) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.productRateChangeBatch.findUnique({
      where: { id: batchId },
      include: { lines: true },
    });
    if (!batch) throw new Error("NOT_FOUND");
    if (
      batch.status !== ProductRateChangeBatchStatus.DRAFT &&
      batch.status !== ProductRateChangeBatchStatus.REJECTED
    ) {
      throw new Error("INVALID_STATUS");
    }
    if (batch.lines.length === 0) throw new Error("EMPTY_BATCH");

    for (const line of batch.lines) {
      const current = await resolveCurrentProductPrice(tx, line.productId);
      if (!current) throw new Error("MISSING_CURRENT_PRICE");
      await tx.productRateChangeLine.update({
        where: { id: line.id },
        data: {
          previousStandardPrice: current.standardPrice,
          previousMinimumPrice: current.minimumPrice,
        },
      });
    }

    await tx.productRateChangeSignOff.deleteMany({ where: { batchId } });

    const updated = await tx.productRateChangeBatch.update({
      where: { id: batchId },
      data: {
        status: ProductRateChangeBatchStatus.PENDING,
        submittedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
        rejectedById: null,
        appliedAt: null,
      },
      include: batchInclude,
    });
    return serializeProductRateChangeBatch(updated);
  });
}

async function applyApprovedBatchPrices(
  tx: Prisma.TransactionClient,
  batchId: string,
) {
  const batch = await tx.productRateChangeBatch.findUnique({
    where: { id: batchId },
    include: { lines: true },
  });
  if (!batch) throw new Error("NOT_FOUND");

  const effectiveFrom = new Date();
  for (const line of batch.lines) {
    const current = await resolveCurrentProductPrice(tx, line.productId);
    if (!current) throw new Error("MISSING_CURRENT_PRICE");
    await addProductPrice(tx, line.productId, {
      landingCost: decimalToNumber(current.landingCost),
      standardPrice: decimalToNumber(line.newStandardPrice),
      minimumPrice: decimalToNumber(line.newMinimumPrice),
      effectiveFrom,
    });
  }

  await tx.productRateChangeBatch.update({
    where: { id: batchId },
    data: {
      status: ProductRateChangeBatchStatus.APPROVED,
      appliedAt: effectiveFrom,
    },
  });
}

export async function approveProductRateChangeBatch(
  prisma: PrismaClient,
  input: { batchId: string; userId: string; userRoles: string[] },
) {
  if (!canApproveProductRateChange(input.userRoles)) {
    throw new Error("FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.productRateChangeBatch.findUnique({
      where: { id: input.batchId },
      include: { signOffs: true },
    });
    if (!batch) throw new Error("NOT_FOUND");
    if (batch.status !== ProductRateChangeBatchStatus.PENDING) {
      throw new Error("INVALID_STATUS");
    }

    const alreadySigned = batch.signOffs.some((row) => row.userId === input.userId);
    if (!alreadySigned) {
      await tx.productRateChangeSignOff.create({
        data: { batchId: input.batchId, userId: input.userId },
      });
    }

    const signOffCount = alreadySigned
      ? batch.signOffs.length
      : batch.signOffs.length + 1;

    if (signOffCount >= PRODUCT_RATE_CHANGE_REQUIRED_APPROVALS) {
      await applyApprovedBatchPrices(tx, input.batchId);
    }

    const updated = await tx.productRateChangeBatch.findUnique({
      where: { id: input.batchId },
      include: batchInclude,
    });
    if (!updated) throw new Error("NOT_FOUND");
    return serializeProductRateChangeBatch(updated);
  });
}

export async function rejectProductRateChangeBatch(
  prisma: PrismaClient,
  input: { batchId: string; userId: string; userRoles: string[]; reason: string },
) {
  if (!canApproveProductRateChange(input.userRoles)) {
    throw new Error("FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.productRateChangeBatch.findUnique({
      where: { id: input.batchId },
    });
    if (!batch) throw new Error("NOT_FOUND");
    if (batch.status !== ProductRateChangeBatchStatus.PENDING) {
      throw new Error("INVALID_STATUS");
    }

    await tx.productRateChangeSignOff.deleteMany({ where: { batchId: input.batchId } });

    const updated = await tx.productRateChangeBatch.update({
      where: { id: input.batchId },
      data: {
        status: ProductRateChangeBatchStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedById: input.userId,
        rejectionReason: input.reason.trim(),
      },
      include: batchInclude,
    });
    return serializeProductRateChangeBatch(updated);
  });
}

export async function deleteProductRateChangeBatch(prisma: PrismaClient, batchId: string) {
  const batch = await prisma.productRateChangeBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("NOT_FOUND");
  if (batch.status !== ProductRateChangeBatchStatus.DRAFT) {
    throw new Error("NOT_DELETABLE");
  }
  await prisma.productRateChangeBatch.delete({ where: { id: batchId } });
}
