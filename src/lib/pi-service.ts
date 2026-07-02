import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  InventoryTransactionType,
  ItemApprovalStatus,
  Prisma,
  ProformaInvoiceStatus,
  QuotationStatus,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber } from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import {
  calculateAdvanceRequired,
  calculateOutstanding,
  canRequestBooking,
  generateProformaInvoiceNumber,
  toDateOnly,
} from "@/lib/proforma-invoices";
import { calculateLineAmounts, roundMoney } from "@/lib/quotations";

const piInclude = {
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
  quotation: { select: { id: true, quotationNo: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  bookedBy: { select: { id: true, name: true } },
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
          serialTracking: true,
        },
      },
    },
  },
  payments: {
    include: {
      recordedBy: { select: { id: true, name: true } },
    },
    orderBy: { paymentDate: "desc" as const },
  },
} satisfies Prisma.ProformaInvoiceInclude;

export type ProformaInvoiceRecord = Prisma.ProformaInvoiceGetPayload<{
  include: typeof piInclude;
}>;

type PiLineInput = {
  productId: string;
  qty: number;
  rate: number;
};

function serializePi(pi: ProformaInvoiceRecord) {
  const totalPaid = roundMoney(
    pi.payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0),
  );
  const totalValue = decimalToNumber(pi.totalValue);

  return {
    id: pi.id,
    piNo: pi.piNo,
    status: pi.status,
    piDate: pi.piDate.toISOString().slice(0, 10),
    totalValue,
    notes: pi.notes,
    bookedAt: pi.bookedAt?.toISOString() ?? null,
    customer: pi.customer,
    salesUser: pi.salesUser,
    quotation: pi.quotation,
    warehouse: pi.warehouse,
    bookedBy: pi.bookedBy,
    items: pi.items.map((item) => ({
      id: item.id,
      qty: decimalToNumber(item.qty),
      rate: decimalToNumber(item.rate),
      gstRate: decimalToNumber(item.gstRate),
      lineTotal: decimalToNumber(item.lineTotal),
      product: item.product,
    })),
    payments: pi.payments.map((payment) => ({
      id: payment.id,
      amount: decimalToNumber(payment.amount),
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      paymentMode: payment.paymentMode,
      referenceNo: payment.referenceNo,
      notes: payment.notes,
      recordedBy: payment.recordedBy,
    })),
    paymentSummary: {
      totalPaid,
      outstanding: calculateOutstanding(totalValue, totalPaid),
      advanceRequired: calculateAdvanceRequired(totalValue),
      canRequestBooking: canRequestBooking(totalValue, totalPaid),
    },
  };
}

async function buildPiLines(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    companyId: string;
    lines: PiLineInput[];
    piDate: Date;
  },
) {
  if (input.lines.length === 0) throw new Error("LINES_REQUIRED");

  const built = [];
  for (const line of input.lines) {
    const product = await prisma.product.findFirst({
      where: { id: line.productId, isActive: true },
    });
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    const amounts = calculateLineAmounts({
      pricingType: product.pricingType,
      capacity: decimalToNumber(product.capacity),
      qty: line.qty,
      rate: line.rate,
      gstRate: decimalToNumber(product.gstRate),
    });

    built.push({
      productId: line.productId,
      qty: line.qty,
      rate: line.rate,
      gstRate: decimalToNumber(product.gstRate),
      lineTotal: amounts.lineTotal,
    });
  }

  return built;
}

async function bookInventoryForPi(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    warehouseId: string;
    piId: string;
    piNo: string;
    items: Array<{ productId: string; qty: number; serialTracking: boolean }>;
    performedById: string;
  },
) {
  for (const item of input.items) {
    if (item.serialTracking) {
      const qty = Math.ceil(item.qty);
      const serials = await tx.inventorySerial.findMany({
        where: {
          productId: item.productId,
          currentWarehouseId: input.warehouseId,
          status: SerialStatus.AVAILABLE,
          lot: { companyId: input.companyId },
        },
        orderBy: { createdAt: "asc" },
        take: qty,
      });

      if (serials.length < qty) throw new Error("INSUFFICIENT_STOCK");

      await tx.inventorySerial.updateMany({
        where: { id: { in: serials.map((serial) => serial.id) } },
        data: { status: SerialStatus.BOOKED },
      });

      await tx.proformaInvoiceSerial.createMany({
        data: serials.map((serial) => ({
          piId: input.piId,
          serialId: serial.id,
        })),
        skipDuplicates: true,
      });

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.BOOK,
          companyId: input.companyId,
          productId: item.productId,
          qty,
          fromWarehouseId: input.warehouseId,
          referenceType: "PROFORMA_INVOICE",
          referenceId: input.piId,
          notes: `Booked for ${input.piNo}`,
          createdById: input.performedById,
        },
      });
    } else {
      const stock = await getWarehouseStockForProduct(
        tx as unknown as PrismaClient,
        input.companyId,
        item.productId,
        input.warehouseId,
      );
      if (stock.availableStock < item.qty) throw new Error("INSUFFICIENT_STOCK");

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.BOOK,
          companyId: input.companyId,
          productId: item.productId,
          qty: item.qty,
          fromWarehouseId: input.warehouseId,
          referenceType: "PROFORMA_INVOICE",
          referenceId: input.piId,
          notes: `Booked for ${input.piNo}`,
          createdById: input.performedById,
        },
      });
    }
  }
}

export async function listProformaInvoices(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    status?: ProformaInvoiceStatus;
    customerId?: string;
  },
) {
  const rows = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.q
        ? {
            OR: [
              { piNo: { contains: filters.q, mode: "insensitive" } },
              { customer: { customerName: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: piInclude,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(serializePi);
}

export async function getProformaInvoiceById(
  prisma: PrismaClient,
  companyId: string,
  piId: string,
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: piId, companyId },
    include: piInclude,
  });
  if (!pi) return null;
  return serializePi(pi);
}

export async function createProformaInvoice(
  prisma: PrismaClient,
  input: {
    companyId: string;
    customerId: string;
    salesUserId: string;
    warehouseId?: string;
    createdById: string;
    notes?: string;
    issue: boolean;
    lines: PiLineInput[];
  },
) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: input.companyId },
  });

  const piDate = toDateOnly(new Date());
  const builtLines = await buildPiLines(prisma, {
    companyId: input.companyId,
    lines: input.lines,
    piDate,
  });
  const totalValue = roundMoney(builtLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const piNo = await generateProformaInvoiceNumber(prisma, company.code, input.companyId, piDate);
  const status = input.issue ? ProformaInvoiceStatus.ISSUED : ProformaInvoiceStatus.DRAFT;

  return prisma.$transaction(async (tx) => {
    const pi = await tx.proformaInvoice.create({
      data: {
        piNo,
        companyId: input.companyId,
        customerId: input.customerId,
        salesUserId: input.salesUserId,
        warehouseId: input.warehouseId ?? null,
        status,
        piDate,
        totalValue,
        notes: input.notes,
        items: {
          create: builtLines,
        },
      },
      include: piInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "CREATE",
      newValue: { piNo: pi.piNo, status: pi.status },
      performedBy: input.createdById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    return serializePi(pi);
  });
}

export async function createProformaFromQuotation(
  prisma: PrismaClient,
  input: {
    companyId: string;
    quotationId: string;
    warehouseId?: string;
    createdById: string;
    issue: boolean;
  },
) {
  const quotation = await prisma.quotation.findFirst({
    where: { id: input.quotationId, companyId: input.companyId },
    include: { items: true, company: true },
  });

  if (!quotation) throw new Error("NOT_FOUND");
  if (quotation.status !== QuotationStatus.SENT) throw new Error("INVALID_QUOTATION_STATUS");

  const existingPi = await prisma.proformaInvoice.findUnique({
    where: { quotationId: quotation.id },
  });
  if (existingPi) throw new Error("ALREADY_CONVERTED");

  const hasPendingItems = quotation.items.some(
    (item) => item.approvalStatus === ItemApprovalStatus.PENDING,
  );
  if (hasPendingItems) throw new Error("PRICE_APPROVAL_REQUIRED");

  const piDate = toDateOnly(new Date());
  const piNo = await generateProformaInvoiceNumber(
    prisma,
    quotation.company.code,
    input.companyId,
    piDate,
  );
  const status = input.issue ? ProformaInvoiceStatus.ISSUED : ProformaInvoiceStatus.DRAFT;

  return prisma.$transaction(async (tx) => {
    const pi = await tx.proformaInvoice.create({
      data: {
        piNo,
        companyId: quotation.companyId,
        customerId: quotation.customerId,
        salesUserId: quotation.salesUserId,
        quotationId: quotation.id,
        warehouseId: input.warehouseId ?? null,
        status,
        piDate,
        totalValue: quotation.totalValue,
        notes: quotation.notes,
        items: {
          create: quotation.items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            rate: item.rate,
            gstRate: item.gstRate,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: piInclude,
    });

    await tx.quotation.update({
      where: { id: quotation.id },
      data: { status: QuotationStatus.CONVERTED },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "CREATE",
      newValue: { piNo: pi.piNo, quotationId: quotation.id },
      performedBy: input.createdById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    await writeAuditLogTx(tx, {
      tableName: "quotations",
      recordId: quotation.id,
      action: "UPDATE",
      oldValue: { status: QuotationStatus.SENT },
      newValue: { status: QuotationStatus.CONVERTED },
      performedBy: input.createdById,
      companyId: input.companyId,
      reference: quotation.quotationNo,
    });

    return serializePi(pi);
  });
}

export async function issueProformaInvoice(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    performedById: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.DRAFT) throw new Error("INVALID_STATUS");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: { status: ProformaInvoiceStatus.ISSUED },
      include: piInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { status: ProformaInvoiceStatus.DRAFT },
      newValue: { status: ProformaInvoiceStatus.ISSUED },
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    return serializePi(updated);
  });
}

export async function recordPayment(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    amount: number;
    paymentDate: Date;
    paymentMode: string;
    referenceNo?: string;
    notes?: string;
    recordedById: string;
  },
) {
  if (input.amount <= 0) throw new Error("INVALID_AMOUNT");

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: { payments: true },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (
    pi.status === ProformaInvoiceStatus.DRAFT ||
    pi.status === ProformaInvoiceStatus.CANCELLED
  ) {
    throw new Error("INVALID_STATUS");
  }

  const totalPaid = pi.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  const outstanding = calculateOutstanding(decimalToNumber(pi.totalValue), totalPaid);
  if (input.amount > outstanding) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING");

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        companyId: input.companyId,
        customerId: pi.customerId,
        proformaInvoiceId: pi.id,
        amount: input.amount,
        paymentDate: input.paymentDate,
        paymentMode: input.paymentMode as never,
        referenceNo: input.referenceNo,
        notes: input.notes,
        recordedById: input.recordedById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "payments",
      recordId: payment.id,
      action: "CREATE",
      newValue: { amount: input.amount, piNo: pi.piNo },
      performedBy: input.recordedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    const updated = await tx.proformaInvoice.findUniqueOrThrow({
      where: { id: pi.id },
      include: piInclude,
    });

    return serializePi(updated);
  });
}

export async function requestBooking(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    warehouseId: string;
    requestedById: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: { payments: true, items: { include: { product: true } } },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.ISSUED) throw new Error("INVALID_STATUS");

  const totalPaid = pi.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  if (!canRequestBooking(decimalToNumber(pi.totalValue), totalPaid)) {
    throw new Error("ADVANCE_NOT_MET");
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: input.companyId, isActive: true },
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

  const existingApproval = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.BOOKING,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (existingApproval) throw new Error("BOOKING_ALREADY_REQUESTED");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        status: ProformaInvoiceStatus.PENDING_BOOKING,
        warehouseId: input.warehouseId,
      },
      include: piInclude,
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.BOOKING,
        moduleId: pi.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      newValue: { status: ProformaInvoiceStatus.PENDING_BOOKING },
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    return serializePi(updated);
  });
}

export async function approveBooking(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: { items: { include: { product: true } } },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.PENDING_BOOKING) throw new Error("INVALID_STATUS");
  if (!pi.warehouseId) throw new Error("WAREHOUSE_REQUIRED");

  return prisma.$transaction(async (tx) => {
    await bookInventoryForPi(tx, {
      companyId: input.companyId,
      warehouseId: pi.warehouseId!,
      piId: pi.id,
      piNo: pi.piNo,
      items: pi.items.map((item) => ({
        productId: item.productId,
        qty: decimalToNumber(item.qty),
        serialTracking: item.product.serialTracking,
      })),
      performedById: input.approvedById,
    });

    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        status: ProformaInvoiceStatus.BOOKED,
        bookedAt: new Date(),
        bookedById: input.approvedById,
      },
      include: piInclude,
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.BOOKING,
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "APPROVE",
      newValue: { status: ProformaInvoiceStatus.BOOKED },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    return serializePi(updated);
  });
}

export async function countBookedOrders(prisma: PrismaClient, companyId: string) {
  return prisma.proformaInvoice.count({
    where: { companyId, status: ProformaInvoiceStatus.BOOKED },
  });
}

export async function countPendingBookingApprovals(
  prisma: PrismaClient,
  companyId: string,
) {
  return prisma.proformaInvoice.count({
    where: { companyId, status: ProformaInvoiceStatus.PENDING_BOOKING },
  });
}

export async function countPendingPayments(prisma: PrismaClient, companyId: string) {
  const issuedPis = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      status: { in: [ProformaInvoiceStatus.ISSUED, ProformaInvoiceStatus.PENDING_BOOKING] },
    },
    include: { payments: true },
  });

  return issuedPis.filter((pi) => {
    const totalPaid = pi.payments.reduce(
      (sum, payment) => sum + decimalToNumber(payment.amount),
      0,
    );
    return totalPaid < decimalToNumber(pi.totalValue);
  }).length;
}

export async function getCustomerPiMetrics(
  prisma: PrismaClient,
  companyId: string,
  customerId: string,
) {
  const pis = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      customerId,
      status: {
        notIn: [ProformaInvoiceStatus.DRAFT, ProformaInvoiceStatus.CANCELLED],
      },
    },
    include: { payments: true },
  });

  let outstandingValue = 0;
  let openPiCount = 0;

  for (const pi of pis) {
    const totalValue = decimalToNumber(pi.totalValue);
    const totalPaid = pi.payments.reduce(
      (sum, payment) => sum + decimalToNumber(payment.amount),
      0,
    );
    const outstanding = calculateOutstanding(totalValue, totalPaid);
    outstandingValue += outstanding;
    if (outstanding > 0) openPiCount += 1;
  }

  return {
    outstandingValue: roundMoney(outstandingValue),
    openPiCount,
  };
}

export async function getProformaInvoiceRecord(
  prisma: PrismaClient,
  companyId: string,
  piId: string,
): Promise<ProformaInvoiceRecord | null> {
  return prisma.proformaInvoice.findFirst({
    where: { id: piId, companyId },
    include: piInclude,
  });
}
