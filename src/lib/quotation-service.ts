import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  ItemApprovalStatus,
  Prisma,
  QuotationStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber } from "@/lib/inventory";
import {
  QUOTATION_VALIDITY_DAYS,
  addDays,
  calculateLineAmounts,
  diffQuotationLines,
  formatRevisionQuotationNo,
  generateQuotationNumber,
  roundMoney,
  toDateOnly,
  type QuotationLineChange,
  type QuotationLineSnapshot,
} from "@/lib/quotations";

const quotationInclude = {
  company: {
    select: {
      id: true,
      name: true,
      code: true,
      logoUrl: true,
      digitalSignatureUrl: true,
      bankDetails: true,
      termsAndConditions: true,
    },
  },
  customer: {
    select: {
      id: true,
      customerName: true,
      customerCode: true,
      gstNumber: true,
      address: true,
      city: true,
      state: true,
      mobile: true,
      email: true,
    },
  },
  salesUser: { select: { id: true, name: true, email: true } },
  parentQuotation: {
    select: { id: true, quotationNo: true, revisionNo: true },
  },
  revisions: {
    select: {
      id: true,
      quotationNo: true,
      revisionNo: true,
      status: true,
      createdAt: true,
    },
    orderBy: { revisionNo: "asc" as const },
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          pricingType: true,
          capacity: true,
          capacityUnit: true,
          gstRate: true,
          hsn: true,
        },
      },
    },
  },
} satisfies Prisma.QuotationInclude;

export type QuotationRecord = Prisma.QuotationGetPayload<{
  include: typeof quotationInclude;
}>;

type QuotationLineInput = {
  productId: string;
  qty: number;
  rate: number;
};

type BuildLineResult = {
  productId: string;
  qty: number;
  rate: number;
  gstRate: number;
  lineTotal: number;
  approvalStatus: ItemApprovalStatus;
};

async function getCurrentMinimumPrice(
  prisma: PrismaClient | Prisma.TransactionClient,
  productId: string,
  asOf: Date,
) {
  const asOfDay = toDateOnly(asOf);
  const nextDay = addDays(asOfDay, 1);

  return prisma.productPrice.findFirst({
    where: {
      productId,
      effectiveFrom: { lt: nextDay },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDay } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

async function buildQuotationLines(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    companyId: string;
    lines: QuotationLineInput[];
    quotationDate: Date;
  },
): Promise<BuildLineResult[]> {
  const results: BuildLineResult[] = [];

  for (const line of input.lines) {
    if (line.qty <= 0) throw new Error("INVALID_QUANTITY");

    const product = await prisma.product.findFirst({
      where: { id: line.productId, isActive: true },
    });
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    const price = await getCurrentMinimumPrice(
      prisma,
      line.productId,
      input.quotationDate,
    );
    if (!price) throw new Error("PRODUCT_PRICE_NOT_FOUND");

    const { lineTotal } = calculateLineAmounts({
      pricingType: product.pricingType,
      capacity: decimalToNumber(product.capacity),
      qty: line.qty,
      rate: line.rate,
      gstRate: decimalToNumber(product.gstRate),
    });

    const minimumPrice = decimalToNumber(price.minimumPrice);
    const approvalStatus =
      line.rate < minimumPrice ? ItemApprovalStatus.PENDING : ItemApprovalStatus.AUTO;

    results.push({
      productId: line.productId,
      qty: line.qty,
      rate: line.rate,
      gstRate: decimalToNumber(product.gstRate),
      lineTotal,
      approvalStatus,
    });
  }

  return results;
}

function serializeQuotationNumbers(quotation: QuotationRecord) {
  return {
    ...quotation,
    totalValue: decimalToNumber(quotation.totalValue),
    items: quotation.items.map((item) => ({
      ...item,
      qty: decimalToNumber(item.qty),
      rate: decimalToNumber(item.rate),
      gstRate: decimalToNumber(item.gstRate),
      lineTotal: decimalToNumber(item.lineTotal),
      product: {
        ...item.product,
        capacity: decimalToNumber(item.product.capacity),
        gstRate: decimalToNumber(item.product.gstRate),
      },
    })),
  };
}

export function serializeQuotation(quotation: QuotationRecord) {
  return serializeQuotationNumbers(quotation);
}

export async function refreshExpiredQuotations(
  prisma: PrismaClient,
  companyId: string,
) {
  const today = toDateOnly(new Date());
  await prisma.quotation.updateMany({
    where: {
      companyId,
      status: QuotationStatus.SENT,
      expiryDate: { lt: today },
    },
    data: { status: QuotationStatus.EXPIRED },
  });
}

export async function listQuotations(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    status?: QuotationStatus;
    customerId?: string;
  },
) {
  await refreshExpiredQuotations(prisma, companyId);

  const where: Prisma.QuotationWhereInput = {
    companyId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.q
      ? {
          OR: [
            { quotationNo: { contains: filters.q, mode: "insensitive" } },
            { customer: { customerName: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const quotations = await prisma.quotation.findMany({
    where,
    include: quotationInclude,
    orderBy: { createdAt: "desc" },
  });

  return quotations.map(serializeQuotation);
}

export async function getQuotationById(
  prisma: PrismaClient,
  companyId: string,
  quotationId: string,
) {
  await refreshExpiredQuotations(prisma, companyId);

  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, companyId },
    include: quotationInclude,
  });

  if (!quotation) return null;

  const rootId = quotation.parentQuotationId ?? quotation.id;
  const revisionChain = await prisma.quotation.findMany({
    where: {
      companyId,
      OR: [{ id: rootId }, { parentQuotationId: rootId }],
    },
    select: {
      id: true,
      quotationNo: true,
      revisionNo: true,
      status: true,
      createdAt: true,
    },
    orderBy: { revisionNo: "asc" },
  });

  const previousRevision = revisionChain
    .filter((revision) => revision.revisionNo < quotation.revisionNo)
    .sort((a, b) => b.revisionNo - a.revisionNo)[0];

  let changesFromPrevious: QuotationLineChange[] | null = null;
  let previousRevisionNo: number | null = null;

  if (previousRevision) {
    const previousItems = await prisma.quotationItem.findMany({
      where: { quotationId: previousRevision.id },
      include: { product: { select: { id: true, displayName: true } } },
    });

    const previousSnapshot: QuotationLineSnapshot[] = previousItems.map((item) => ({
      productId: item.productId,
      productName: item.product.displayName,
      qty: decimalToNumber(item.qty),
      rate: decimalToNumber(item.rate),
      lineTotal: decimalToNumber(item.lineTotal),
    }));
    const currentSnapshot: QuotationLineSnapshot[] = quotation.items.map((item) => ({
      productId: item.productId,
      productName: item.product.displayName,
      qty: decimalToNumber(item.qty),
      rate: decimalToNumber(item.rate),
      lineTotal: decimalToNumber(item.lineTotal),
    }));

    changesFromPrevious = diffQuotationLines(previousSnapshot, currentSnapshot);
    previousRevisionNo = previousRevision.revisionNo;
  }

  return {
    ...serializeQuotation({
      ...quotation,
      revisions: revisionChain,
    }),
    changesFromPrevious,
    previousRevisionNo,
  };
}

export async function countOpenQuotations(
  prisma: PrismaClient,
  companyId: string,
  salesUserId?: string,
) {
  await refreshExpiredQuotations(prisma, companyId);

  return prisma.quotation.count({
    where: {
      companyId,
      status: QuotationStatus.SENT,
      ...(salesUserId ? { salesUserId } : {}),
    },
  });
}

export async function countPendingQuotationApprovals(
  prisma: PrismaClient,
  companyId: string,
) {
  return prisma.quotation.count({
    where: {
      companyId,
      items: { some: { approvalStatus: ItemApprovalStatus.PENDING } },
    },
  });
}

async function createApprovalRequestIfNeeded(
  tx: Prisma.TransactionClient,
  input: {
    quotationId: string;
    requestedById: string;
    hasPendingItems: boolean;
  },
) {
  if (!input.hasPendingItems) return;

  const existing = await tx.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.QUOTATION,
      moduleId: input.quotationId,
      status: ApprovalRequestStatus.PENDING,
    },
  });

  if (!existing) {
    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.QUOTATION,
        moduleId: input.quotationId,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
      },
    });
  }
}

export async function createQuotation(
  prisma: PrismaClient,
  input: {
    companyId: string;
    customerId: string;
    salesUserId: string;
    createdById: string;
    notes?: string;
    send: boolean;
    lines: QuotationLineInput[];
  },
) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, code: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: input.companyId },
  });
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

  if (input.lines.length === 0) throw new Error("LINES_REQUIRED");

  const quotationDate = toDateOnly(new Date());
  const expiryDate = toDateOnly(addDays(quotationDate, QUOTATION_VALIDITY_DAYS));
  const builtLines = await buildQuotationLines(prisma, {
    companyId: input.companyId,
    lines: input.lines,
    quotationDate,
  });

  const hasPendingItems = builtLines.some(
    (line) => line.approvalStatus === ItemApprovalStatus.PENDING,
  );
  if (input.send && hasPendingItems) throw new Error("PRICE_APPROVAL_REQUIRED");

  const totalValue = roundMoney(builtLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const baseNo = await generateQuotationNumber(prisma, company.code, input.companyId);
  const status = input.send ? QuotationStatus.SENT : QuotationStatus.DRAFT;

  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.create({
      data: {
        quotationNo: baseNo,
        companyId: input.companyId,
        customerId: input.customerId,
        salesUserId: input.salesUserId,
        status,
        revisionNo: 1,
        quotationDate,
        expiryDate,
        totalValue,
        notes: input.notes,
        items: {
          create: builtLines.map((line) => ({
            productId: line.productId,
            qty: line.qty,
            rate: line.rate,
            gstRate: line.gstRate,
            lineTotal: line.lineTotal,
            approvalStatus: line.approvalStatus,
          })),
        },
      },
      include: quotationInclude,
    });

    await createApprovalRequestIfNeeded(tx, {
      quotationId: quotation.id,
      requestedById: input.createdById,
      hasPendingItems,
    });

    await writeAuditLogTx(tx, {
      tableName: "quotations",
      recordId: quotation.id,
      action: "CREATE",
      newValue: { quotationNo: quotation.quotationNo, status: quotation.status },
      performedBy: input.createdById,
      companyId: input.companyId,
      reference: quotation.quotationNo,
    });

    return serializeQuotation(quotation);
  });
}

export async function reviseQuotation(
  prisma: PrismaClient,
  input: {
    companyId: string;
    quotationId: string;
    createdById: string;
    notes?: string;
    send: boolean;
    lines: QuotationLineInput[];
  },
) {
  const source = await prisma.quotation.findFirst({
    where: { id: input.quotationId, companyId: input.companyId },
    include: { items: true },
  });

  if (!source) throw new Error("NOT_FOUND");
  if (source.status === QuotationStatus.CONVERTED) throw new Error("ALREADY_CONVERTED");
  if (source.status === QuotationStatus.DRAFT) throw new Error("DRAFT_CANNOT_REVISE");

  const rootId = source.parentQuotationId ?? source.id;
  const root = source.parentQuotationId
    ? await prisma.quotation.findUnique({ where: { id: rootId } })
    : source;
  if (!root) throw new Error("NOT_FOUND");

  const latestRevision = await prisma.quotation.findFirst({
    where: {
      OR: [{ id: rootId }, { parentQuotationId: rootId }],
    },
    orderBy: { revisionNo: "desc" },
  });
  const nextRevisionNo = (latestRevision?.revisionNo ?? 1) + 1;

  const quotationDate = toDateOnly(new Date());
  const expiryDate = toDateOnly(addDays(quotationDate, QUOTATION_VALIDITY_DAYS));
  const builtLines = await buildQuotationLines(prisma, {
    companyId: input.companyId,
    lines: input.lines,
    quotationDate,
  });

  const hasPendingItems = builtLines.some(
    (line) => line.approvalStatus === ItemApprovalStatus.PENDING,
  );
  if (input.send && hasPendingItems) throw new Error("PRICE_APPROVAL_REQUIRED");

  const totalValue = roundMoney(builtLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const baseNo = root.quotationNo.replace(/-R\d+$/, "");
  const quotationNo = formatRevisionQuotationNo(baseNo, nextRevisionNo);
  const status = input.send ? QuotationStatus.SENT : QuotationStatus.DRAFT;

  const productNames = await prisma.product.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...source.items.map((item) => item.productId),
            ...builtLines.map((line) => line.productId),
          ]),
        ],
      },
    },
    select: { id: true, displayName: true },
  });
  const nameById = new Map(productNames.map((product) => [product.id, product.displayName]));
  const previousSnapshot: QuotationLineSnapshot[] = source.items.map((item) => ({
    productId: item.productId,
    productName: nameById.get(item.productId) ?? item.productId,
    qty: decimalToNumber(item.qty),
    rate: decimalToNumber(item.rate),
    lineTotal: decimalToNumber(item.lineTotal),
  }));
  const nextSnapshot: QuotationLineSnapshot[] = builtLines.map((line) => ({
    productId: line.productId,
    productName: nameById.get(line.productId) ?? line.productId,
    qty: line.qty,
    rate: line.rate,
    lineTotal: line.lineTotal,
  }));
  const lineChanges = diffQuotationLines(previousSnapshot, nextSnapshot);
  const previousTotal = roundMoney(
    source.items.reduce((sum, item) => sum + decimalToNumber(item.lineTotal), 0),
  );

  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.create({
      data: {
        quotationNo,
        companyId: source.companyId,
        customerId: source.customerId,
        salesUserId: source.salesUserId,
        status,
        revisionNo: nextRevisionNo,
        parentQuotationId: rootId,
        quotationDate,
        expiryDate,
        totalValue,
        notes: input.notes ?? source.notes,
        items: {
          create: builtLines.map((line) => ({
            productId: line.productId,
            qty: line.qty,
            rate: line.rate,
            gstRate: line.gstRate,
            lineTotal: line.lineTotal,
            approvalStatus: line.approvalStatus,
          })),
        },
      },
      include: quotationInclude,
    });

    await createApprovalRequestIfNeeded(tx, {
      quotationId: quotation.id,
      requestedById: input.createdById,
      hasPendingItems,
    });

    await writeAuditLogTx(tx, {
      tableName: "quotations",
      recordId: quotation.id,
      action: "UPDATE",
      oldValue: {
        quotationId: source.id,
        quotationNo: source.quotationNo,
        revisionNo: source.revisionNo,
        totalValue: previousTotal,
        lines: previousSnapshot,
      },
      newValue: {
        quotationNo: quotation.quotationNo,
        revisionNo: quotation.revisionNo,
        parentQuotationId: rootId,
        totalValue,
        lines: nextSnapshot,
        changes: lineChanges,
      },
      performedBy: input.createdById,
      companyId: input.companyId,
      reference: quotation.quotationNo,
    });

    return serializeQuotation(quotation);
  });
}

export async function sendQuotation(
  prisma: PrismaClient,
  input: {
    companyId: string;
    quotationId: string;
    performedById: string;
  },
) {
  const quotation = await prisma.quotation.findFirst({
    where: { id: input.quotationId, companyId: input.companyId },
    include: { items: true },
  });

  if (!quotation) throw new Error("NOT_FOUND");
  if (quotation.status !== QuotationStatus.DRAFT) throw new Error("INVALID_STATUS");

  const hasPendingItems = quotation.items.some(
    (item) => item.approvalStatus === ItemApprovalStatus.PENDING,
  );
  if (hasPendingItems) throw new Error("PRICE_APPROVAL_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.quotation.update({
      where: { id: quotation.id },
      data: { status: QuotationStatus.SENT },
      include: quotationInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "quotations",
      recordId: quotation.id,
      action: "UPDATE",
      oldValue: { status: QuotationStatus.DRAFT },
      newValue: { status: QuotationStatus.SENT },
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: quotation.quotationNo,
    });

    return serializeQuotation(updated);
  });
}

export async function approveQuotationPricing(
  prisma: PrismaClient,
  input: {
    companyId: string;
    quotationId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const quotation = await prisma.quotation.findFirst({
    where: { id: input.quotationId, companyId: input.companyId },
    include: { items: true },
  });

  if (!quotation) throw new Error("NOT_FOUND");

  const pendingItems = quotation.items.filter(
    (item) => item.approvalStatus === ItemApprovalStatus.PENDING,
  );
  if (pendingItems.length === 0) throw new Error("NO_PENDING_APPROVAL");

  return prisma.$transaction(async (tx) => {
    await tx.quotationItem.updateMany({
      where: {
        quotationId: quotation.id,
        approvalStatus: ItemApprovalStatus.PENDING,
      },
      data: { approvalStatus: ItemApprovalStatus.APPROVED },
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.QUOTATION,
        moduleId: quotation.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks,
      },
    });

    const updated = await tx.quotation.findUniqueOrThrow({
      where: { id: quotation.id },
      include: quotationInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "quotations",
      recordId: quotation.id,
      action: "APPROVE",
      newValue: { approvedItems: pendingItems.length },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: quotation.quotationNo,
    });

    return serializeQuotation(updated);
  });
}

export async function getCustomerQuotationMetrics(
  prisma: PrismaClient,
  companyId: string,
  customerId: string,
) {
  await refreshExpiredQuotations(prisma, companyId);

  const openQuotationCount = await prisma.quotation.count({
    where: {
      companyId,
      customerId,
      status: QuotationStatus.SENT,
    },
  });

  return { openQuotationCount };
}
