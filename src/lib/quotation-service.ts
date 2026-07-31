import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  ItemApprovalStatus,
  Prisma,
  QuotationStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import {
  bookingAllowed as isBookingAllowed,
  getDeliveryTermNote,
  type DeliveryTermMode,
  type DeliveryTerms,
} from "@/lib/delivery-terms";
import { decimalToNumber } from "@/lib/inventory";
import { getProductStockSummary } from "@/lib/inventory-service";
import {
  evaluateQuotationWarnings,
  type QuotationWarning,
} from "@/lib/quotation-warnings";
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

export const quotationInclude = {
  company: {
    select: {
      id: true,
      name: true,
      code: true,
      logoUrl: true,
      digitalSignatureUrl: true,
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
  salesUser: {
    select: { id: true, name: true, email: true, mobile: true, officialContactNumber: true },
  },
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

type QuotationDeliveryTermInput = {
  deliveryTermMode: DeliveryTermMode;
  requiredPaymentPercent?: number | null;
  dispatchMinDays?: number | null;
  dispatchMaxDays?: number | null;
};

export class QuotationWarningsRequiredError extends Error {
  constructor(readonly warnings: QuotationWarning[]) {
    super("QUOTATION_WARNINGS_REQUIRED");
  }
}

function normalizeDeliveryTerms(input: QuotationDeliveryTermInput) {
  const terms: DeliveryTerms =
    input.deliveryTermMode === "ADVANCE_BOOKING"
      ? {
          mode: input.deliveryTermMode,
          requiredPaymentPercent: input.requiredPaymentPercent,
          dispatchMinDays: input.dispatchMinDays,
          dispatchMaxDays: input.dispatchMaxDays,
        }
      : input.deliveryTermMode === "READY_STOCK"
        ? { mode: input.deliveryTermMode, requiredPaymentPercent: 100 }
        : { mode: input.deliveryTermMode };

  return {
    deliveryTermMode: terms.mode,
    bookingAllowed: isBookingAllowed(terms.mode),
    requiredPaymentPercent: terms.requiredPaymentPercent ?? null,
    dispatchMinDays: terms.dispatchMinDays ?? null,
    dispatchMaxDays: terms.dispatchMaxDays ?? null,
    deliveryTermNoteSnapshot: getDeliveryTermNote(terms),
  };
}

async function getQuotationWarnings(
  prisma: PrismaClient,
  input: {
    companyId: string;
    productIds: string[];
    permittedCompanyIds: string[];
  },
) {
  const permittedCompanyIds = [
    ...new Set([...input.permittedCompanyIds, input.companyId]),
  ];
  const [selectedCompany, products, companies] = await Promise.all([
    prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true, code: true },
    }),
    prisma.product.findMany({
      where: { id: { in: input.productIds } },
      select: {
        id: true,
        displayName: true,
        category: { select: { name: true } },
      },
    }),
    prisma.company.findMany({
      where: { id: { in: permittedCompanyIds } },
      select: { id: true, name: true },
    }),
  ]);
  if (!selectedCompany) throw new Error("COMPANY_NOT_FOUND");

  const stockAvailability = (
    await Promise.all(
      companies.flatMap((company) =>
        products.map(async (product) => {
          const stock = await getProductStockSummary(
            prisma,
            company.id,
            product.id,
          );
          return {
            productId: product.id,
            companyId: company.id,
            companyName: company.name,
            availableQuantity: stock.availableStock,
          };
        }),
      ),
    )
  );

  return evaluateQuotationWarnings({
    selectedCompany,
    items: products.map((product) => ({
      productId: product.id,
      sku: product.displayName,
      categoryName: product.category.name,
    })),
    stockAvailability,
    permittedCompanyIds,
  });
}

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
    requiredPaymentPercent:
      quotation.requiredPaymentPercent == null
        ? null
        : decimalToNumber(quotation.requiredPaymentPercent),
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

  const pendingPriceApproval = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.QUOTATION,
      moduleId: quotation.id,
      status: ApprovalRequestStatus.PENDING,
    },
    select: { id: true },
  });

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
    pendingPriceApproval: Boolean(pendingPriceApproval),
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
  const pending = await prisma.approvalRequest.findMany({
    where: {
      moduleType: ApprovalModuleType.QUOTATION,
      status: ApprovalRequestStatus.PENDING,
    },
    select: { moduleId: true },
  });
  if (pending.length === 0) return 0;

  return prisma.quotation.count({
    where: {
      companyId,
      id: { in: pending.map((row) => row.moduleId) },
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
    permittedCompanyIds: string[];
    proceedWithWarnings: boolean;
  } & QuotationDeliveryTermInput,
) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, code: true },
  });
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
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
  const status = input.send ? QuotationStatus.SENT : QuotationStatus.DRAFT;
  const deliveryTerms = normalizeDeliveryTerms(input);
  const warnings = await getQuotationWarnings(prisma, {
    companyId: input.companyId,
    productIds: input.lines.map((line) => line.productId),
    permittedCompanyIds: input.permittedCompanyIds,
  });
  if (warnings.length > 0 && !input.proceedWithWarnings) {
    throw new QuotationWarningsRequiredError(warnings);
  }
  const baseNo = await generateQuotationNumber(prisma, company.code, input.companyId);

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
        ...deliveryTerms,
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

    if (warnings.length > 0) {
      await tx.quotationWarningLog.createMany({
        data: warnings.map((warning) => ({
          quotationId: quotation.id,
          companyId: input.companyId,
          warningType: warning.type,
          displayed: true,
          details: warning as Prisma.InputJsonValue,
          proceededById: input.createdById,
        })),
      });
    }

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
    permittedCompanyIds: string[];
    proceedWithWarnings: boolean;
  } & QuotationDeliveryTermInput,
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
  const deliveryTerms = normalizeDeliveryTerms(input);
  const warnings = await getQuotationWarnings(prisma, {
    companyId: input.companyId,
    productIds: input.lines.map((line) => line.productId),
    permittedCompanyIds: input.permittedCompanyIds,
  });
  if (warnings.length > 0 && !input.proceedWithWarnings) {
    throw new QuotationWarningsRequiredError(warnings);
  }

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
        ...deliveryTerms,
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

    if (warnings.length > 0) {
      await tx.quotationWarningLog.createMany({
        data: warnings.map((warning) => ({
          quotationId: quotation.id,
          companyId: input.companyId,
          warningType: warning.type,
          displayed: true,
          details: warning as Prisma.InputJsonValue,
          proceededById: input.createdById,
        })),
      });
    }

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

export async function rejectQuotationPricing(
  prisma: PrismaClient,
  input: {
    companyId: string;
    quotationId: string;
    rejectedById: string;
    reason: string;
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

  const pendingRequest = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.QUOTATION,
      moduleId: quotation.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pendingRequest) throw new Error("NO_PENDING_APPROVAL");

  return prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: pendingRequest.id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: input.reason,
      },
    });

    const updated = await tx.quotation.findUniqueOrThrow({
      where: { id: quotation.id },
      include: quotationInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "quotations",
      recordId: quotation.id,
      action: "UPDATE",
      newValue: {
        decision: "REJECTED",
        reason: input.reason,
        pendingItems: pendingItems.length,
      },
      performedBy: input.rejectedById,
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
