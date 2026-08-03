import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  DispatchStatus,
  InventoryEventStatus,
  InventoryEventType,
  InventoryTransactionType,
  ItemApprovalStatus,
  PiCrossCompanyTransferPlanStatus,
  Prisma,
  ProformaInvoiceStatus,
  QuotationStatus,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import {
  createOrReplaceCrossCompanyPlan,
  prepareDispatchTodayCrossCompany,
  requestCrossCompanyPlanApproval,
  type SerializedPlan,
} from "@/lib/cross-company-transfer-service";
import { decimalToNumber } from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import { createEvent } from "@/lib/inventory-event-service";
import { getInventoryProjection } from "@/lib/inventory-projection-service";
import {
  explodeItemsForFulfillment,
  mergeFulfillmentQuantities,
} from "@/lib/kit-fulfillment";
import {
  notifyBookingCreated,
  notifyDispatchTodayApprovalNeeded,
  notifyPiCancelApprovalNeeded,
  notifyPiCancelled,
  notifyWarehouseDispatchToday,
} from "@/lib/notification-service";
import {
  calculateAdvanceRequired,
  calculateOutstanding,
  canRequestBooking,
  daysUntilCommittedDispatch,
  generateProformaInvoiceNumber,
  isDispatchTodayActive,
  isReadyForDispatch,
  maxPaymentAmountOnEdit,
  needsEarlyDispatchTodayApproval,
  resolveBookingRequirement,
  toDateOnly,
} from "@/lib/proforma-invoices";
import { calculateLineAmounts, roundMoney } from "@/lib/quotations";
import { addCalendarDays } from "@/lib/working-days";
import { createWorkingDaysService } from "@/lib/working-days-service";

export const piInclude = {
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
  quotation: {
    select: {
      id: true,
      quotationNo: true,
      deliveryTermMode: true,
      bookingAllowed: true,
      requiredPaymentPercent: true,
      dispatchMinDays: true,
      dispatchMaxDays: true,
    },
  },
  warehouse: { select: { id: true, name: true, code: true } },
  bookedBy: { select: { id: true, name: true } },
  dispatchTodayMarkedBy: { select: { id: true, name: true } },
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

function serializePi(
  pi: ProformaInvoiceRecord,
  options?: {
    pendingDispatchTodayApproval?: boolean;
    crossCompanyTransfer?: SerializedPlan | null;
  },
) {
  const totalPaid = roundMoney(
    pi.payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0),
  );
  const totalValue = decimalToNumber(pi.totalValue);
  const outstanding = calculateOutstanding(totalValue, totalPaid);
  const requirement = resolveBookingRequirement(
    {
      deliveryTermMode: pi.deliveryTermMode,
      bookingAllowed: pi.bookingAllowed,
      requiredPaymentPercent:
        pi.requiredPaymentPercent == null
          ? null
          : decimalToNumber(pi.requiredPaymentPercent),
    },
    pi.quotation
      ? {
          deliveryTermMode: pi.quotation.deliveryTermMode,
          bookingAllowed: pi.quotation.bookingAllowed,
          requiredPaymentPercent:
            pi.quotation.requiredPaymentPercent == null
              ? null
              : decimalToNumber(pi.quotation.requiredPaymentPercent),
        }
      : null,
  );

  const today = toDateOnly(new Date());
  const todayString = today.toISOString().slice(0, 10);
  const requiredDispatchMinDate = pi.requiredDispatchMinDate
    ? pi.requiredDispatchMinDate.toISOString().slice(0, 10)
    : null;
  const requiredDispatchMaxDate = pi.requiredDispatchMaxDate
    ? pi.requiredDispatchMaxDate.toISOString().slice(0, 10)
    : null;
  const dispatchTodayDate = pi.dispatchTodayDate
    ? pi.dispatchTodayDate.toISOString().slice(0, 10)
    : null;
  const daysUntilCommitted = daysUntilCommittedDispatch(
    requiredDispatchMinDate,
    todayString,
  );
  const readyForDispatch = isReadyForDispatch(pi.status, outstanding);
  const dispatchTodayActive = isDispatchTodayActive(dispatchTodayDate, todayString);

  return {
    id: pi.id,
    piNo: pi.piNo,
    status: pi.status,
    piDate: pi.piDate.toISOString().slice(0, 10),
    totalValue,
    notes: pi.notes,
    bookedAt: pi.bookedAt?.toISOString() ?? null,
    deliveryTermMode: pi.deliveryTermMode,
    bookingAllowed: pi.bookingAllowed,
    requiredPaymentPercent:
      pi.requiredPaymentPercent == null
        ? null
        : decimalToNumber(pi.requiredPaymentPercent),
    dispatchMinDays: pi.dispatchMinDays,
    dispatchMaxDays: pi.dispatchMaxDays,
    deliveryTermNoteSnapshot: pi.deliveryTermNoteSnapshot,
    requiredDispatchMinDate,
    requiredDispatchMaxDate,
    daysUntilCommittedDispatch: daysUntilCommitted,
    dispatchToday: {
      date: dispatchTodayDate,
      active: dispatchTodayActive,
      markedAt: pi.dispatchTodayMarkedAt?.toISOString() ?? null,
      markedBy: pi.dispatchTodayMarkedBy ?? null,
      pendingApproval: options?.pendingDispatchTodayApproval ?? false,
      needsEarlyApproval: needsEarlyDispatchTodayApproval(
        requiredDispatchMinDate,
        todayString,
      ),
      draft: {
        vehicleNo: pi.dispatchDraftVehicleNo,
        driverName: pi.dispatchDraftDriverName,
        receiverName: pi.dispatchDraftReceiverName,
        receiverMobile: pi.dispatchDraftReceiverMobile,
        notes: pi.dispatchDraftNotes,
      },
    },
    crossCompanyTransfer: options?.crossCompanyTransfer ?? null,
    customer: pi.customer,
    salesUser: pi.salesUser,
    quotation: pi.quotation
      ? {
          ...pi.quotation,
          requiredPaymentPercent:
            pi.quotation.requiredPaymentPercent == null
              ? null
              : decimalToNumber(pi.quotation.requiredPaymentPercent),
        }
      : pi.quotation,
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
      receivedInAccount: payment.receivedInAccount,
      referenceNo: payment.referenceNo,
      notes: payment.notes,
      recordedBy: payment.recordedBy,
    })),
    paymentSummary: {
      totalPaid,
      outstanding,
      requiredPaymentPercent: requirement.requiredPaymentPercent,
      advanceRequired: calculateAdvanceRequired(
        totalValue,
        requirement.requiredPaymentPercent,
      ),
      canRequestBooking: canRequestBooking(totalValue, totalPaid, requirement),
      bookingBlockedReason: requirement.reason ?? null,
      readyForDispatch,
      canMarkDispatchToday: readyForDispatch && !dispatchTodayActive,
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
      // Qty reservation only — specific serials are assigned when recorded on a DC.
      // Count on-hand units (available + already reserved on open DCs / legacy bookings).
      const onHandCount = await tx.inventorySerial.count({
        where: {
          productId: item.productId,
          currentWarehouseId: input.warehouseId,
          status: { in: [SerialStatus.AVAILABLE, SerialStatus.BOOKED] },
        },
      });

      if (onHandCount < qty) throw new Error("INSUFFICIENT_STOCK");

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
  await clearExpiredDispatchTodayFlags(prisma, companyId);

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

  return rows.map((row) => serializePi(row));
}

export async function getProformaInvoiceById(
  prisma: PrismaClient,
  companyId: string,
  piId: string,
) {
  await clearExpiredDispatchTodayFlags(prisma, companyId, piId);

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: piId, companyId },
    include: piInclude,
  });
  if (!pi) return null;

  const pendingApproval = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.DISPATCH_TODAY,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
    select: { id: true },
  });

  const plan = await prisma.piCrossCompanyTransferPlan.findFirst({
    where: {
      piId: pi.id,
      status: {
        in: [
          PiCrossCompanyTransferPlanStatus.PENDING,
          PiCrossCompanyTransferPlanStatus.APPROVED,
          PiCrossCompanyTransferPlanStatus.COMPLETED,
        ],
      },
    },
    include: {
      fromCompany: { select: { id: true, code: true, name: true } },
      toCompany: { select: { id: true, code: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      lines: {
        include: {
          product: { select: { id: true, displayName: true, serialTracking: true } },
          serials: {
            include: { serial: { select: { id: true, serialNumber: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return serializePi(pi, {
    pendingDispatchTodayApproval: Boolean(pendingApproval),
    crossCompanyTransfer: plan
      ? {
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
        }
      : null,
  });
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
        deliveryTermMode: quotation.deliveryTermMode,
        bookingAllowed: quotation.bookingAllowed,
        requiredPaymentPercent: quotation.requiredPaymentPercent,
        dispatchMinDays: quotation.dispatchMinDays,
        dispatchMaxDays: quotation.dispatchMaxDays,
        deliveryTermNoteSnapshot: quotation.deliveryTermNoteSnapshot,
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
    receivedInAccount: string;
    referenceNo: string;
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
    pi.status === ProformaInvoiceStatus.CANCEL_PENDING ||
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
        receivedInAccount: input.receivedInAccount as never,
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

async function loadPiForPaymentMutation(
  prisma: PrismaClient,
  companyId: string,
  piId: string,
  paymentId: string,
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: piId, companyId },
    include: { payments: true },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (
    pi.status === ProformaInvoiceStatus.DRAFT ||
    pi.status === ProformaInvoiceStatus.CANCEL_PENDING ||
    pi.status === ProformaInvoiceStatus.CANCELLED
  ) {
    throw new Error("INVALID_STATUS");
  }

  const payment = pi.payments.find((row) => row.id === paymentId);
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");

  return { pi, payment };
}

export async function updatePayment(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    paymentId: string;
    amount: number;
    paymentDate: Date;
    paymentMode: string;
    receivedInAccount: string;
    referenceNo: string;
    notes?: string;
    performedById: string;
  },
) {
  if (input.amount <= 0) throw new Error("INVALID_AMOUNT");

  const { pi, payment } = await loadPiForPaymentMutation(
    prisma,
    input.companyId,
    input.piId,
    input.paymentId,
  );

  const totalPaid = pi.payments.reduce(
    (sum, row) => sum + decimalToNumber(row.amount),
    0,
  );
  const maxAmount = maxPaymentAmountOnEdit(
    decimalToNumber(pi.totalValue),
    totalPaid,
    decimalToNumber(payment.amount),
  );
  if (input.amount > maxAmount) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING");

  return prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        amount: input.amount,
        paymentDate: input.paymentDate,
        paymentMode: input.paymentMode as never,
        receivedInAccount: input.receivedInAccount as never,
        referenceNo: input.referenceNo,
        notes: input.notes,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "payments",
      recordId: payment.id,
      action: "UPDATE",
      oldValue: {
        amount: decimalToNumber(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMode: payment.paymentMode,
        receivedInAccount: payment.receivedInAccount,
        referenceNo: payment.referenceNo,
        notes: payment.notes,
      },
      newValue: {
        amount: input.amount,
        paymentDate: input.paymentDate,
        paymentMode: input.paymentMode,
        receivedInAccount: input.receivedInAccount,
        referenceNo: input.referenceNo,
        notes: input.notes ?? null,
        piNo: pi.piNo,
      },
      performedBy: input.performedById,
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

export async function deletePayment(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    paymentId: string;
    performedById: string;
  },
) {
  const { pi, payment } = await loadPiForPaymentMutation(
    prisma,
    input.companyId,
    input.piId,
    input.paymentId,
  );

  return prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: payment.id } });

    await writeAuditLogTx(tx, {
      tableName: "payments",
      recordId: payment.id,
      action: "CANCEL",
      oldValue: {
        amount: decimalToNumber(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMode: payment.paymentMode,
        receivedInAccount: payment.receivedInAccount,
        referenceNo: payment.referenceNo,
        notes: payment.notes,
        piNo: pi.piNo,
      },
      performedBy: input.performedById,
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

const bookingPiInclude = {
  payments: { select: { amount: true } },
  items: { include: { product: { include: { category: true } } } },
  quotation: {
    select: {
      deliveryTermMode: true,
      bookingAllowed: true,
      requiredPaymentPercent: true,
      dispatchMinDays: true,
      dispatchMaxDays: true,
    },
  },
} as const;

type BookingPiRecord = Prisma.ProformaInvoiceGetPayload<{
  include: typeof bookingPiInclude;
}>;

function resolvePiBookingRequirement(pi: BookingPiRecord) {
  return resolveBookingRequirement(
    {
      deliveryTermMode: pi.deliveryTermMode,
      bookingAllowed: pi.bookingAllowed,
      requiredPaymentPercent:
        pi.requiredPaymentPercent == null
          ? null
          : decimalToNumber(pi.requiredPaymentPercent),
    },
    pi.quotation
      ? {
          deliveryTermMode: pi.quotation.deliveryTermMode,
          bookingAllowed: pi.quotation.bookingAllowed,
          requiredPaymentPercent:
            pi.quotation.requiredPaymentPercent == null
              ? null
              : decimalToNumber(pi.quotation.requiredPaymentPercent),
        }
      : null,
  );
}

/** Reserve stock and mark the PI BOOKED. Used for direct booking and legacy approvals. */
async function completePiStockBooking(
  prisma: PrismaClient,
  input: {
    companyId: string;
    pi: BookingPiRecord;
    warehouseId: string;
    performedById: string;
    requiredPaymentPercent: number;
    auditAction: "UPDATE" | "APPROVE";
    remarks?: string;
    completePendingApproval?: boolean;
  },
) {
  const { pi, warehouseId } = input;
  const bookingDate = new Date();
  const bookingDateString = bookingDate.toISOString().slice(0, 10);
  const mode = pi.deliveryTermMode ?? pi.quotation?.deliveryTermMode ?? null;
  const minDays =
    mode === "READY_STOCK"
      ? 0
      : (pi.dispatchMinDays ?? pi.quotation?.dispatchMinDays ?? 0);
  const maxDays =
    mode === "READY_STOCK"
      ? 0
      : (pi.dispatchMaxDays ?? pi.quotation?.dispatchMaxDays ?? minDays);
  const workingDays = createWorkingDaysService(prisma);
  const [dispatchMinString, dispatchMaxString] = await Promise.all([
    workingDays.getNextWorkingDate(
      input.companyId,
      warehouseId,
      addCalendarDays(bookingDateString, minDays),
    ),
    workingDays.getNextWorkingDate(
      input.companyId,
      warehouseId,
      addCalendarDays(bookingDateString, maxDays),
    ),
  ]);
  const requiredDispatchMinDate = new Date(`${dispatchMinString}T00:00:00.000Z`);
  const requiredDispatchMaxDate = new Date(`${dispatchMaxString}T00:00:00.000Z`);

  const fulfillmentLines = await explodeItemsForFulfillment(
    prisma,
    pi.items.map((item) => ({
      productId: item.productId,
      qty: decimalToNumber(item.qty),
      serialTracking: item.product.serialTracking,
      displayName: item.product.displayName,
      categoryName: item.product.category.name,
    })),
  );
  const quantitiesByProduct = mergeFulfillmentQuantities(fulfillmentLines);

  for (const [productId, entry] of quantitiesByProduct) {
    const projection = await getInventoryProjection({
      companyId: input.companyId,
      warehouseId,
      productId,
      startDate: bookingDateString,
      endDate: dispatchMaxString,
    });
    const minimumProjected = projection.length
      ? Math.min(...projection.map((day) => day.projectedAvailableQuantity))
      : 0;
    if (minimumProjected < entry.qty) {
      const shortage = roundMoney(entry.qty - minimumProjected);
      throw new Error(
        `INSUFFICIENT_PROJECTED_STOCK|${entry.displayName}|${shortage}`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    await bookInventoryForPi(tx, {
      companyId: input.companyId,
      warehouseId,
      piId: pi.id,
      piNo: pi.piNo,
      items: [...quantitiesByProduct.entries()].map(([productId, entry]) => ({
        productId,
        qty: entry.qty,
        serialTracking: entry.serialTracking,
      })),
      performedById: input.performedById,
    });

    for (const [productId, entry] of quantitiesByProduct) {
      await createEvent(tx, {
        companyId: input.companyId,
        warehouseId,
        productId,
        eventType: InventoryEventType.BOOKING_RESERVATION,
        quantity: entry.qty,
        effectiveDate: bookingDate,
        expectedMinDate: requiredDispatchMinDate,
        expectedMaxDate: requiredDispatchMaxDate,
        sourceType: "PROFORMA_INVOICE",
        sourceId: pi.id,
        sourceNumber: pi.piNo,
        notes: `Reserved for ${pi.piNo}`,
        createdById: input.performedById,
      });
    }

    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        status: ProformaInvoiceStatus.BOOKED,
        warehouseId,
        bookedAt: bookingDate,
        bookedById: input.performedById,
        requiredPaymentPercent: input.requiredPaymentPercent,
        requiredDispatchMinDate,
        requiredDispatchMaxDate,
      },
      include: piInclude,
    });

    if (input.completePendingApproval) {
      await tx.approvalRequest.updateMany({
        where: {
          moduleType: ApprovalModuleType.BOOKING,
          moduleId: pi.id,
          status: ApprovalRequestStatus.PENDING,
        },
        data: {
          status: ApprovalRequestStatus.APPROVED,
          approvedById: input.performedById,
          remarks: input.remarks,
        },
      });
    }

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: input.auditAction,
      newValue: { status: ProformaInvoiceStatus.BOOKED },
      performedBy: input.performedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    await notifyBookingCreated(tx, {
      salesUserId: pi.salesUserId,
      piNo: pi.piNo,
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
    include: bookingPiInclude,
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.ISSUED) throw new Error("INVALID_STATUS");

  const totalPaid = pi.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  const requirement = resolvePiBookingRequirement(pi);
  if (!requirement.allowed) {
    throw new Error("BOOKING_NOT_ALLOWED");
  }
  if (!canRequestBooking(decimalToNumber(pi.totalValue), totalPaid, requirement)) {
    throw new Error("ADVANCE_NOT_MET");
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: input.companyId, isActive: true },
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

  // Payment conditions already met — book stock immediately (no approval loop).
  return completePiStockBooking(prisma, {
    companyId: input.companyId,
    pi,
    warehouseId: input.warehouseId,
    performedById: input.requestedById,
    requiredPaymentPercent: requirement.requiredPaymentPercent,
    auditAction: "UPDATE",
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
    include: bookingPiInclude,
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.PENDING_BOOKING) throw new Error("INVALID_STATUS");
  if (!pi.warehouseId) throw new Error("WAREHOUSE_REQUIRED");

  const requirement = resolvePiBookingRequirement(pi);
  if (!requirement.allowed) throw new Error("BOOKING_NOT_ALLOWED");
  const totalPaid = pi.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  if (!canRequestBooking(decimalToNumber(pi.totalValue), totalPaid, requirement)) {
    throw new Error("ADVANCE_NOT_MET");
  }

  return completePiStockBooking(prisma, {
    companyId: input.companyId,
    pi,
    warehouseId: pi.warehouseId,
    performedById: input.approvedById,
    requiredPaymentPercent: requirement.requiredPaymentPercent,
    auditAction: "APPROVE",
    remarks: input.remarks,
    completePendingApproval: true,
  });
}

export async function rejectBooking(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.PENDING_BOOKING) throw new Error("INVALID_STATUS");

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.BOOKING,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pending) throw new Error("NO_PENDING_APPROVAL");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: { status: ProformaInvoiceStatus.ISSUED },
      include: piInclude,
    });

    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: input.reason,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { status: ProformaInvoiceStatus.PENDING_BOOKING },
      newValue: {
        status: ProformaInvoiceStatus.ISSUED,
        decision: "REJECTED",
        reason: input.reason,
      },
      performedBy: input.rejectedById,
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
  const openPis = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      status: {
        in: [
          ProformaInvoiceStatus.ISSUED,
          ProformaInvoiceStatus.PENDING_BOOKING,
          ProformaInvoiceStatus.BOOKED,
          ProformaInvoiceStatus.PARTIALLY_DISPATCHED,
        ],
      },
    },
    include: { payments: true },
  });

  return openPis.filter((pi) => {
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
        notIn: [
          ProformaInvoiceStatus.DRAFT,
          ProformaInvoiceStatus.CANCEL_PENDING,
          ProformaInvoiceStatus.CANCELLED,
        ],
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

type DispatchTodayDraftInput = {
  vehicleNo?: string;
  driverName?: string;
  receiverName?: string;
  receiverMobile?: string;
  notes?: string;
};

function draftFieldsFromInput(draft?: DispatchTodayDraftInput) {
  if (!draft) return {};
  return {
    ...(draft.vehicleNo !== undefined
      ? { dispatchDraftVehicleNo: draft.vehicleNo || null }
      : {}),
    ...(draft.driverName !== undefined
      ? { dispatchDraftDriverName: draft.driverName || null }
      : {}),
    ...(draft.receiverName !== undefined
      ? { dispatchDraftReceiverName: draft.receiverName || null }
      : {}),
    ...(draft.receiverMobile !== undefined
      ? { dispatchDraftReceiverMobile: draft.receiverMobile || null }
      : {}),
    ...(draft.notes !== undefined ? { dispatchDraftNotes: draft.notes || null } : {}),
  };
}

export async function clearExpiredDispatchTodayFlags(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  piId?: string,
) {
  const today = toDateOnly(new Date());
  await prisma.proformaInvoice.updateMany({
    where: {
      companyId,
      ...(piId ? { id: piId } : {}),
      dispatchTodayDate: { not: null, lt: today },
      status: {
        in: [ProformaInvoiceStatus.BOOKED, ProformaInvoiceStatus.PARTIALLY_DISPATCHED],
      },
    },
    data: {
      dispatchTodayDate: null,
      dispatchTodayMarkedAt: null,
      dispatchTodayMarkedById: null,
    },
  });
}

async function pullBookingReservationToToday(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    piId: string;
    today: Date;
    updatedById: string;
  },
) {
  await tx.inventoryEvent.updateMany({
    where: {
      companyId: input.companyId,
      sourceType: "PROFORMA_INVOICE",
      sourceId: input.piId,
      eventType: InventoryEventType.BOOKING_RESERVATION,
      status: InventoryEventStatus.ACTIVE,
    },
    data: {
      expectedMinDate: input.today,
      expectedMaxDate: input.today,
      updatedById: input.updatedById,
    },
  });
}

async function activateDispatchToday(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    piId: string;
    piNo: string;
    markedById: string;
    draft?: DispatchTodayDraftInput;
  },
) {
  const today = toDateOnly(new Date());
  await pullBookingReservationToToday(tx, {
    companyId: input.companyId,
    piId: input.piId,
    today,
    updatedById: input.markedById,
  });

  const updated = await tx.proformaInvoice.update({
    where: { id: input.piId },
    data: {
      dispatchTodayDate: today,
      dispatchTodayMarkedAt: new Date(),
      dispatchTodayMarkedById: input.markedById,
      ...draftFieldsFromInput(input.draft),
    },
    include: piInclude,
  });

  await tx.approvalRequest.updateMany({
    where: {
      moduleType: ApprovalModuleType.DISPATCH_TODAY,
      moduleId: input.piId,
      status: ApprovalRequestStatus.PENDING,
    },
    data: {
      status: ApprovalRequestStatus.APPROVED,
      approvedById: input.markedById,
    },
  });

  await writeAuditLogTx(tx, {
    tableName: "proforma_invoices",
    recordId: input.piId,
    action: "UPDATE",
    newValue: { dispatchTodayDate: today.toISOString().slice(0, 10) },
    performedBy: input.markedById,
    companyId: input.companyId,
    reference: input.piNo,
  });

  await notifyWarehouseDispatchToday(tx, {
    companyId: input.companyId,
    piNo: input.piNo,
  });

  return updated;
}

/**
 * Sales marks PI for dispatch today. If committed min date is still in the
 * future and/or PI-company stock is short, creates pending approval(s)
 * instead of activating immediately.
 */
export async function markDispatchToday(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    markedById: string;
    canApproveEarly: boolean;
    confirmEarly?: boolean;
    confirmCrossCompany?: boolean;
    fromCompanyId?: string;
    draft?: DispatchTodayDraftInput;
  },
) {
  await clearExpiredDispatchTodayFlags(prisma, input.companyId, input.piId);

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: { ...piInclude, payments: true, items: true },
  });
  if (!pi) throw new Error("NOT_FOUND");

  const totalPaid = pi.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  const outstanding = calculateOutstanding(decimalToNumber(pi.totalValue), totalPaid);
  if (!isReadyForDispatch(pi.status, outstanding)) {
    throw new Error("NOT_READY_FOR_DISPATCH");
  }

  const todayString = toDateOnly(new Date()).toISOString().slice(0, 10);
  if (isDispatchTodayActive(pi.dispatchTodayDate, todayString)) {
    const updated = await prisma.proformaInvoice.update({
      where: { id: pi.id },
      data: draftFieldsFromInput(input.draft),
      include: piInclude,
    });
    return serializePi(updated, { pendingDispatchTodayApproval: false });
  }

  const prepared = await prepareDispatchTodayCrossCompany(prisma, {
    companyId: input.companyId,
    piId: pi.id,
    fromCompanyId: input.fromCompanyId,
  });

  const daysUntil = daysUntilCommittedDispatch(pi.requiredDispatchMinDate, todayString);
  const needsEarlyApproval = needsEarlyDispatchTodayApproval(
    pi.requiredDispatchMinDate,
    todayString,
  );
  const needsCrossCompanyApproval = prepared.needsPlan;
  const needsApproval = needsEarlyApproval || needsCrossCompanyApproval;

  if (needsEarlyApproval && !input.confirmEarly) {
    throw new Error(
      `EARLY_DISPATCH_CONFIRMATION_REQUIRED|${daysUntil ?? 0}|${
        pi.requiredDispatchMinDate?.toISOString().slice(0, 10) ?? ""
      }`,
    );
  }

  if (needsCrossCompanyApproval && !input.confirmCrossCompany) {
    throw new Error("CROSS_COMPANY_CONFIRMATION_REQUIRED");
  }

  if (needsApproval && !input.canApproveEarly) {
    const existing = await prisma.approvalRequest.findFirst({
      where: {
        moduleType: ApprovalModuleType.DISPATCH_TODAY,
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
    });
    if (existing) throw new Error("DISPATCH_TODAY_ALREADY_REQUESTED");

    const fromCompany = needsCrossCompanyApproval
      ? await prisma.company.findUniqueOrThrow({
          where: { id: prepared.fromCompanyId! },
          select: { code: true },
        })
      : null;

    return prisma.$transaction(async (tx) => {
      if (input.draft) {
        await tx.proformaInvoice.update({
          where: { id: pi.id },
          data: draftFieldsFromInput(input.draft),
        });
      }

      let planSerialized: SerializedPlan | null = null;
      if (needsCrossCompanyApproval) {
        const plan = await createOrReplaceCrossCompanyPlan(tx, {
          piId: pi.id,
          toCompanyId: input.companyId,
          fromCompanyId: prepared.fromCompanyId!,
          shortfallLines: prepared.shortfallLines,
          requestedById: input.markedById,
          status: PiCrossCompanyTransferPlanStatus.PENDING,
        });
        await requestCrossCompanyPlanApproval(tx, {
          planId: plan.id,
          piNo: pi.piNo,
          companyId: input.companyId,
          requestedById: input.markedById,
          fromCompanyCode: fromCompany!.code,
        });
        planSerialized = {
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
            serials: [],
          })),
          approvedBy: null,
          approvedAt: null,
          inventoryTransferId: null,
          dispatchId: null,
        };
      }

      const remarkParts: string[] = [];
      if (needsEarlyApproval && daysUntil != null) {
        remarkParts.push(`Committed delivery is after ${daysUntil} day(s)`);
      }
      if (needsCrossCompanyApproval && fromCompany) {
        remarkParts.push(`Cross-company shortfall transfer from ${fromCompany.code}`);
      }

      await tx.approvalRequest.create({
        data: {
          moduleType: ApprovalModuleType.DISPATCH_TODAY,
          moduleId: pi.id,
          requestedById: input.markedById,
          status: ApprovalRequestStatus.PENDING,
          remarks: remarkParts.join("; ") || "Dispatch today requested",
        },
      });

      await writeAuditLogTx(tx, {
        tableName: "proforma_invoices",
        recordId: pi.id,
        action: "UPDATE",
        newValue: {
          dispatchTodayPendingApproval: true,
          daysUntil,
          crossCompanyFrom: fromCompany?.code ?? null,
        },
        performedBy: input.markedById,
        companyId: input.companyId,
        reference: pi.piNo,
      });

      await notifyDispatchTodayApprovalNeeded(tx, {
        companyId: input.companyId,
        piNo: pi.piNo,
        daysUntil: daysUntil ?? 0,
      });

      const refreshed = await tx.proformaInvoice.findFirstOrThrow({
        where: { id: pi.id },
        include: piInclude,
      });
      return serializePi(refreshed, {
        pendingDispatchTodayApproval: true,
        crossCompanyTransfer: planSerialized,
      });
    });
  }

  return prisma.$transaction(async (tx) => {
    let planSerialized: SerializedPlan | null = null;
    if (needsCrossCompanyApproval) {
      const plan = await createOrReplaceCrossCompanyPlan(tx, {
        piId: pi.id,
        toCompanyId: input.companyId,
        fromCompanyId: prepared.fromCompanyId!,
        shortfallLines: prepared.shortfallLines,
        requestedById: input.markedById,
        status: PiCrossCompanyTransferPlanStatus.APPROVED,
        approvedById: input.markedById,
      });
      planSerialized = {
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
          serials: [],
        })),
        approvedBy: { id: input.markedById, name: "" },
        approvedAt: new Date().toISOString(),
        inventoryTransferId: null,
        dispatchId: null,
      };
    }

    const updated = await activateDispatchToday(tx, {
      companyId: input.companyId,
      piId: pi.id,
      piNo: pi.piNo,
      markedById: input.markedById,
      draft: input.draft,
    });
    return serializePi(updated, {
      pendingDispatchTodayApproval: false,
      crossCompanyTransfer: planSerialized,
    });
  });
}

export async function approveDispatchToday(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  await clearExpiredDispatchTodayFlags(prisma, input.companyId, input.piId);

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: { ...piInclude, payments: true },
  });
  if (!pi) throw new Error("NOT_FOUND");

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.DISPATCH_TODAY,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pending) throw new Error("NO_PENDING_DISPATCH_TODAY");

  const totalPaid = pi.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  const outstanding = calculateOutstanding(decimalToNumber(pi.totalValue), totalPaid);
  if (!isReadyForDispatch(pi.status, outstanding)) {
    throw new Error("NOT_READY_FOR_DISPATCH");
  }

  return prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks,
      },
    });

    const pendingPlan = await tx.piCrossCompanyTransferPlan.findFirst({
      where: {
        piId: pi.id,
        status: PiCrossCompanyTransferPlanStatus.PENDING,
      },
      include: {
        fromCompany: { select: { id: true, code: true, name: true } },
        toCompany: { select: { id: true, code: true, name: true } },
        lines: {
          include: {
            product: { select: { id: true, displayName: true, serialTracking: true } },
            serials: { include: { serial: { select: { id: true, serialNumber: true } } } },
          },
        },
      },
    });

    let planSerialized: SerializedPlan | null = null;
    if (pendingPlan) {
      await tx.approvalRequest.updateMany({
        where: {
          moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
          moduleId: pendingPlan.id,
          status: ApprovalRequestStatus.PENDING,
        },
        data: {
          status: ApprovalRequestStatus.APPROVED,
          approvedById: input.approvedById,
          remarks: input.remarks,
        },
      });

      const updatedPlan = await tx.piCrossCompanyTransferPlan.update({
        where: { id: pendingPlan.id },
        data: {
          status: PiCrossCompanyTransferPlanStatus.APPROVED,
          approvedById: input.approvedById,
          approvedAt: new Date(),
        },
        include: {
          fromCompany: { select: { id: true, code: true, name: true } },
          toCompany: { select: { id: true, code: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          lines: {
            include: {
              product: { select: { id: true, displayName: true, serialTracking: true } },
              serials: {
                include: { serial: { select: { id: true, serialNumber: true } } },
              },
            },
          },
        },
      });

      planSerialized = {
        id: updatedPlan.id,
        status: updatedPlan.status,
        fromCompany: updatedPlan.fromCompany,
        toCompany: updatedPlan.toCompany,
        lines: updatedPlan.lines.map((line) => ({
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
        approvedBy: updatedPlan.approvedBy,
        approvedAt: updatedPlan.approvedAt?.toISOString() ?? null,
        inventoryTransferId: updatedPlan.inventoryTransferId,
        dispatchId: updatedPlan.dispatchId,
      };
    }

    const updated = await activateDispatchToday(tx, {
      companyId: input.companyId,
      piId: pi.id,
      piNo: pi.piNo,
      markedById: input.approvedById,
    });
    return serializePi(updated, {
      pendingDispatchTodayApproval: false,
      crossCompanyTransfer: planSerialized,
    });
  });
}

export async function rejectDispatchToday(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    rejectedById: string;
    reason: string;
  },
) {
  await clearExpiredDispatchTodayFlags(prisma, input.companyId, input.piId);

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.DISPATCH_TODAY,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pending) throw new Error("NO_PENDING_DISPATCH_TODAY");

  return prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: input.reason,
      },
    });

    const pendingPlans = await tx.piCrossCompanyTransferPlan.findMany({
      where: {
        piId: pi.id,
        status: PiCrossCompanyTransferPlanStatus.PENDING,
      },
      select: { id: true },
    });

    if (pendingPlans.length) {
      await tx.piCrossCompanyTransferPlan.updateMany({
        where: { id: { in: pendingPlans.map((row) => row.id) } },
        data: {
          status: PiCrossCompanyTransferPlanStatus.REJECTED,
          rejectionReason: input.reason,
        },
      });
      await tx.approvalRequest.updateMany({
        where: {
          moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
          moduleId: { in: pendingPlans.map((row) => row.id) },
          status: ApprovalRequestStatus.PENDING,
        },
        data: {
          status: ApprovalRequestStatus.REJECTED,
          approvedById: input.rejectedById,
          remarks: input.reason,
        },
      });
    }

    const updated = await tx.proformaInvoice.findUniqueOrThrow({
      where: { id: pi.id },
      include: piInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      newValue: {
        decision: "REJECTED",
        module: "DISPATCH_TODAY",
        reason: input.reason,
      },
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    return serializePi(updated, { pendingDispatchTodayApproval: false });
  });
}

const PI_CANCELABLE_STATUSES: ProformaInvoiceStatus[] = [
  ProformaInvoiceStatus.DRAFT,
  ProformaInvoiceStatus.ISSUED,
  ProformaInvoiceStatus.PENDING_BOOKING,
  ProformaInvoiceStatus.BOOKED,
];

async function releasePiBookingReservations(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    piId: string;
    piNo: string;
    performedById: string;
  },
) {
  const reservations = await tx.inventoryEvent.findMany({
    where: {
      companyId: input.companyId,
      sourceType: "PROFORMA_INVOICE",
      sourceId: input.piId,
      eventType: InventoryEventType.BOOKING_RESERVATION,
      status: { not: InventoryEventStatus.CANCELLED },
    },
  });

  for (const reservation of reservations) {
    const existingRelease = await tx.inventoryEvent.findFirst({
      where: {
        replacesEventId: reservation.id,
        eventType: InventoryEventType.BOOKING_RELEASE,
        status: { not: InventoryEventStatus.CANCELLED },
      },
    });
    if (existingRelease) continue;

    await createEvent(tx, {
      companyId: reservation.companyId,
      warehouseId: reservation.warehouseId,
      productId: reservation.productId,
      eventType: InventoryEventType.BOOKING_RELEASE,
      quantity: decimalToNumber(reservation.quantity),
      effectiveDate: new Date(),
      sourceType: reservation.sourceType,
      sourceId: reservation.sourceId,
      sourceNumber: reservation.sourceNumber,
      replacesEventId: reservation.id,
      notes: `Released booking for cancelled ${input.piNo}`,
      createdById: input.performedById,
    });
  }
}

export async function requestPiCancel(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    requestedById: string;
    remarks?: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (!PI_CANCELABLE_STATUSES.includes(pi.status)) {
    throw new Error("INVALID_STATUS");
  }

  const activeDispatch = await prisma.dispatch.findFirst({
    where: {
      proformaInvoiceId: pi.id,
      status: { not: DispatchStatus.CANCELLED },
    },
    select: { id: true },
  });
  if (activeDispatch) throw new Error("HAS_ACTIVE_DISPATCH");

  const existing = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.PI_CANCEL,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (existing) throw new Error("CANCEL_ALREADY_REQUESTED");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: { status: ProformaInvoiceStatus.CANCEL_PENDING },
      include: piInclude,
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.PI_CANCEL,
        moduleId: pi.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: input.remarks,
      },
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: {
          in: [ApprovalModuleType.BOOKING, ApprovalModuleType.DISPATCH_TODAY],
        },
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.requestedById,
        remarks: input.remarks ?? "Rejected because PI cancel was requested",
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { status: pi.status },
      newValue: { status: ProformaInvoiceStatus.CANCEL_PENDING },
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    await notifyPiCancelApprovalNeeded(tx, {
      companyId: input.companyId,
      piNo: pi.piNo,
    });

    return serializePi(updated);
  });
}

export async function approvePiCancel(
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
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.CANCEL_PENDING) {
    throw new Error("INVALID_STATUS");
  }

  const activeDispatch = await prisma.dispatch.findFirst({
    where: {
      proformaInvoiceId: pi.id,
      status: { not: DispatchStatus.CANCELLED },
    },
    select: { id: true },
  });
  if (activeDispatch) throw new Error("HAS_ACTIVE_DISPATCH");

  return prisma.$transaction(async (tx) => {
    await releasePiBookingReservations(tx, {
      companyId: input.companyId,
      piId: pi.id,
      piNo: pi.piNo,
      performedById: input.approvedById,
    });

    await tx.proformaInvoiceSerial.deleteMany({
      where: { piId: pi.id },
    });

    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
        status: ProformaInvoiceStatus.CANCELLED,
        dispatchTodayDate: null,
        dispatchTodayMarkedAt: null,
        dispatchTodayMarkedById: null,
        dispatchDraftVehicleNo: null,
        dispatchDraftDriverName: null,
        dispatchDraftReceiverName: null,
        dispatchDraftReceiverMobile: null,
        dispatchDraftNotes: null,
      },
      include: piInclude,
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.PI_CANCEL,
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks,
      },
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: {
          in: [ApprovalModuleType.BOOKING, ApprovalModuleType.DISPATCH_TODAY],
        },
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.approvedById,
        remarks: input.remarks ?? "Rejected because PI was cancelled",
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "CANCEL",
      newValue: { status: ProformaInvoiceStatus.CANCELLED },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    await notifyPiCancelled(tx, {
      salesUserId: pi.salesUserId,
      piNo: pi.piNo,
    });

    return serializePi(updated);
  });
}

export async function rejectPiCancel(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (pi.status !== ProformaInvoiceStatus.CANCEL_PENDING) {
    throw new Error("INVALID_STATUS");
  }

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.PI_CANCEL,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pending) throw new Error("NO_PENDING_APPROVAL");

  const logs = await prisma.auditLog.findMany({
    where: {
      tableName: "proforma_invoices",
      recordId: pi.id,
      companyId: input.companyId,
    },
    orderBy: { performedAt: "desc" },
    take: 20,
  });

  let previousStatus: ProformaInvoiceStatus | null = null;
  for (const log of logs) {
    const newValue = log.newValue as { status?: string } | null;
    const oldValue = log.oldValue as { status?: string } | null;
    if (newValue?.status === ProformaInvoiceStatus.CANCEL_PENDING && oldValue?.status) {
      previousStatus = oldValue.status as ProformaInvoiceStatus;
      break;
    }
  }

  if (!previousStatus || !PI_CANCELABLE_STATUSES.includes(previousStatus)) {
    const reservation = await prisma.inventoryEvent.findFirst({
      where: {
        companyId: input.companyId,
        sourceType: "PROFORMA_INVOICE",
        sourceId: pi.id,
        eventType: InventoryEventType.BOOKING_RESERVATION,
        status: { not: InventoryEventStatus.CANCELLED },
      },
      select: { id: true },
    });
    previousStatus = reservation
      ? ProformaInvoiceStatus.BOOKED
      : ProformaInvoiceStatus.ISSUED;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: { status: previousStatus },
      include: piInclude,
    });

    await tx.approvalRequest.update({
      where: { id: pending.id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: input.reason,
      },
    });

    if (previousStatus === ProformaInvoiceStatus.PENDING_BOOKING) {
      const existingBooking = await tx.approvalRequest.findFirst({
        where: {
          moduleType: ApprovalModuleType.BOOKING,
          moduleId: pi.id,
          status: ApprovalRequestStatus.PENDING,
        },
      });
      if (!existingBooking) {
        await tx.approvalRequest.create({
          data: {
            moduleType: ApprovalModuleType.BOOKING,
            moduleId: pi.id,
            requestedById: input.rejectedById,
            status: ApprovalRequestStatus.PENDING,
            remarks: "Reopened after PI cancel rejection",
          },
        });
      }
    }

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      oldValue: { status: ProformaInvoiceStatus.CANCEL_PENDING },
      newValue: {
        status: previousStatus,
        decision: "REJECTED",
        reason: input.reason,
      },
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    return serializePi(updated);
  });
}

