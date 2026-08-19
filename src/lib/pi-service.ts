import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  DispatchStatus,
  InventoryEventStatus,
  InventoryEventType,
  InventoryTransactionType,
  ItemApprovalStatus,
  LotStatus,
  PiCrossCompanyTransferPlanStatus,
  PiEditRequestStatus,
  Prisma,
  ProformaInvoiceStatus,
  QuotationStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import {
  createOrReplaceCrossCompanyPlan,
  getCompanyAvailableQty,
  prepareDispatchTodayCrossCompany,
  type SerializedPlan,
} from "@/lib/cross-company-transfer-service";
import { decimalToNumber } from "@/lib/inventory";
import { createEvent } from "@/lib/inventory-event-service";
import { findFeasibleReservationStartDate } from "@/lib/inventory-projection";
import { getInventoryProjection } from "@/lib/inventory-projection-service";
import {
  explodeItemsForFulfillment,
  mergeFulfillmentQuantities,
} from "@/lib/kit-fulfillment";
import {
  notifyBookingApprovalNeeded,
  notifyBookingCreated,
  notifyDispatchTodayApprovalNeeded,
  notifyPiCancelApprovalNeeded,
  notifyPiCancelled,
  notifyPiEditApprovalNeeded,
  notifyPiEditDecided,
  notifyWarehouseDispatchToday,
  notifyWarehouseDispatchTodayRecalled,
} from "@/lib/notification-service";
import {
  assertCustomerCreditClear,
  clearPiCreditIfPaid,
  serializePiCredit,
} from "@/lib/pi-credit-service";
import { hasApprovedPiCredit } from "@/lib/pi-credit";
import {
  buildDispatchTodayApprovalCopy,
  calculateAdvanceRequired,
  calculateOutstanding,
  canEditProformaInvoice,
  canRequestBooking,
  daysUntilCommittedDispatch,
  formatDispatchTodayApprovalMessage,
  formatDispatchTodayConfirmationMessage,
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
  creditRequestedBy: { select: { id: true, name: true } },
  creditSmApprovedBy: { select: { id: true, name: true } },
  creditAccountsApprovedBy: { select: { id: true, name: true } },
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
  editRequests: {
    where: { status: "PENDING" as const },
    take: 1,
    orderBy: { createdAt: "desc" as const },
    include: {
      requestedBy: { select: { id: true, name: true } },
      proposedCustomer: { select: { id: true, customerName: true, gstNumber: true } },
    },
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

type ProposedPiEditLine = {
  productId: string;
  qty: number;
  rate: number;
  gstRate: number;
  lineTotal: number;
  displayName: string;
};

function parseProposedPiEditLines(value: Prisma.JsonValue): ProposedPiEditLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.productId !== "string") return [];
    return [
      {
        productId: row.productId,
        qty: Number(row.qty) || 0,
        rate: Number(row.rate) || 0,
        gstRate: Number(row.gstRate) || 0,
        lineTotal: Number(row.lineTotal) || 0,
        displayName: typeof row.displayName === "string" ? row.displayName : "Product",
      },
    ];
  });
}

function serializePendingPiEdit(pi: ProformaInvoiceRecord) {
  const row = pi.editRequests[0];
  if (!row) return null;
  return {
    id: row.id,
    requestedBy: row.requestedBy,
    requestedAt: row.createdAt.toISOString(),
    customer: row.proposedCustomer,
    notes: row.proposedNotes,
    issue: row.proposedIssue,
    totalValue: decimalToNumber(row.proposedTotalValue),
    lines: parseProposedPiEditLines(row.proposedLines),
  };
}

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
  const creditApproved = hasApprovedPiCredit(pi.creditStatus);
  const readyForDispatch = isReadyForDispatch(pi.status, outstanding, {
    hasApprovedCredit: creditApproved,
  });
  const dispatchTodayActive = isDispatchTodayActive(dispatchTodayDate, todayString);
  const credit = serializePiCredit(pi, outstanding);

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
    canEdit: canEditProformaInvoice({
      status: pi.status,
      paymentCount: pi.payments.length,
      creditStatus: pi.creditStatus,
      hasPendingEdit: pi.editRequests.length > 0,
    }),
    pendingEdit: serializePendingPiEdit(pi),
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
    credit,
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
      hasApprovedCredit: creditApproved,
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

async function buildProposedPiEditLines(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    companyId: string;
    lines: PiLineInput[];
    piDate: Date;
  },
): Promise<ProposedPiEditLine[]> {
  const built = await buildPiLines(prisma, input);
  const products = await prisma.product.findMany({
    where: { id: { in: built.map((line) => line.productId) } },
    select: { id: true, displayName: true },
  });
  const nameMap = new Map(products.map((product) => [product.id, product.displayName]));
  return built.map((line) => ({
    ...line,
    displayName: nameMap.get(line.productId) ?? "Product",
  }));
}

function normalizePiNotes(notes?: string | null) {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

function piEditMatchesCurrent(
  pi: { customerId: string; notes: string | null; items: Array<{ productId: string; qty: { toNumber(): number } | number | string; rate: { toNumber(): number } | number | string }> },
  input: { customerId: string; notes?: string | null },
  proposedLines: ProposedPiEditLine[],
) {
  if (pi.customerId !== input.customerId) return false;
  if (normalizePiNotes(pi.notes) !== normalizePiNotes(input.notes)) return false;
  if (pi.items.length !== proposedLines.length) return false;

  const currentLines = pi.items
    .map((item) => ({
      productId: item.productId,
      qty: decimalToNumber(item.qty),
      rate: decimalToNumber(item.rate),
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  const nextLines = proposedLines
    .map((line) => ({
      productId: line.productId,
      qty: line.qty,
      rate: line.rate,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  return currentLines.every(
    (line, index) =>
      line.productId === nextLines[index]?.productId &&
      line.qty === nextLines[index]?.qty &&
      line.rate === nextLines[index]?.rate,
  );
}

async function applyProformaInvoiceEditTx(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    pi: {
      id: string;
      piNo: string;
      status: ProformaInvoiceStatus;
      piDate: Date;
      customerId: string;
      totalValue: unknown;
      items: unknown[];
    };
    performedById: string;
    customerId: string;
    notes?: string | null;
    issue?: boolean;
    builtLines: Array<{
      productId: string;
      qty: number;
      rate: number;
      gstRate: number;
      lineTotal: number;
    }>;
    totalValue: number;
  },
) {
  const nextStatus =
    input.pi.status === ProformaInvoiceStatus.DRAFT && input.issue
      ? ProformaInvoiceStatus.ISSUED
      : input.pi.status;
  const notes = normalizePiNotes(input.notes);

  await tx.proformaInvoiceItem.deleteMany({ where: { piId: input.pi.id } });

  const updated = await tx.proformaInvoice.update({
    where: { id: input.pi.id },
    data: {
      customerId: input.customerId,
      notes,
      totalValue: input.totalValue,
      status: nextStatus,
      items: { create: input.builtLines },
    },
    include: piInclude,
  });

  await writeAuditLogTx(tx, {
    tableName: "proforma_invoices",
    recordId: input.pi.id,
    action: "UPDATE",
    oldValue: {
      customerId: input.pi.customerId,
      totalValue: decimalToNumber(input.pi.totalValue),
      status: input.pi.status,
      itemCount: input.pi.items.length,
    },
    newValue: {
      customerId: updated.customerId,
      totalValue: input.totalValue,
      status: updated.status,
      itemCount: input.builtLines.length,
    },
    performedBy: input.performedById,
    companyId: input.companyId,
    reference: input.pi.piNo,
  });

  return updated;
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
    /** When true, local projected stock is short — covered by another company after approval. */
    allowCrossCompanyShortfall?: boolean;
  },
) {
  // Booking is a projected reservation only (PRD C2). Physical / serial on-hand
  // is validated at dispatch; coverage was already checked via projection
  // (including incoming lots that arrive within the dispatch window).
  for (const item of input.items) {
    const qty = item.serialTracking ? Math.ceil(item.qty) : item.qty;
    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.BOOK,
        companyId: input.companyId,
        productId: item.productId,
        qty,
        fromWarehouseId: input.warehouseId,
        referenceType: "PROFORMA_INVOICE",
        referenceId: input.piId,
        notes: input.allowCrossCompanyShortfall
          ? `Booked for ${input.piNo} (cross-company shortfall approved)`
          : `Booked for ${input.piNo}`,
        createdById: input.performedById,
      },
    });
  }
}

export type BookingStockShortage = {
  productId: string;
  displayName: string;
  requiredQty: number;
  localProjectedAvailable: number;
  shortageQty: number;
};

export type BookingStockCoverage = {
  shortages: BookingStockShortage[];
  coveringCompanyCodes: string[];
  /** Feasible reservation start (YYYY-MM-DD) per product when locally coverable. */
  reservationStartByProduct: Map<string, string>;
};

/** Pure decision helper for booking stock + cross-company approval. */
export function resolveBookingStockDecision(input: {
  shortages: BookingStockShortage[];
  coveringCompanyCodes: string[];
  allowCrossCompanyShortfall: boolean;
}): "OK" | "NEED_APPROVAL" | "UNAVAILABLE" {
  if (input.shortages.length === 0) return "OK";
  if (input.coveringCompanyCodes.length === 0) return "UNAVAILABLE";
  if (input.allowCrossCompanyShortfall) return "OK";
  return "NEED_APPROVAL";
}

/**
 * Booking coverage must look through pending purchase incoming dates, not only
 * the commercial dispatch window (READY_STOCK is often "today" and would ignore
 * lots arriving a few days out).
 */
export function resolveCoverageProjectionEndDate(
  dispatchMaxDate: string,
  pendingIncomingMaxDates: readonly (string | null | undefined)[],
): string {
  let end = dispatchMaxDate;
  for (const date of pendingIncomingMaxDates) {
    if (date && date > end) end = date;
  }
  return end;
}

/** Units still needed locally after counting only non-negative projected availability. */
export function bookingShortageQty(
  requiredQty: number,
  bestProjectedAvailable: number,
): number {
  return roundMoney(Math.max(0, requiredQty - Math.max(0, bestProjectedAvailable)));
}

async function loadPendingIncomingMaxByProduct(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    productIds: string[];
    onOrAfterDate: string;
  },
): Promise<Map<string, string>> {
  if (input.productIds.length === 0) return new Map();

  const lots = await prisma.inventoryLot.findMany({
    where: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: { in: input.productIds },
      status: LotStatus.INCOMING,
      expectedMaxDate: {
        gte: new Date(`${input.onOrAfterDate}T00:00:00.000Z`),
      },
    },
    select: {
      productId: true,
      expectedMaxDate: true,
      quantity: true,
      receivedQuantity: true,
      damagedQuantity: true,
    },
  });

  const latestByProduct = new Map<string, string>();
  for (const lot of lots) {
    if (!lot.expectedMaxDate) continue;
    const pending =
      Number(lot.quantity) -
      Number(lot.receivedQuantity) -
      Number(lot.damagedQuantity);
    if (pending <= 1e-9) continue;
    const date = lot.expectedMaxDate.toISOString().slice(0, 10);
    const existing = latestByProduct.get(lot.productId);
    if (!existing || date > existing) {
      latestByProduct.set(lot.productId, date);
    }
  }
  return latestByProduct;
}

async function assessBookingStockCoverage(
  prisma: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    quantitiesByProduct: Map<
      string,
      { qty: number; serialTracking: boolean; displayName: string }
    >;
    dispatchMinString: string;
    dispatchMaxString: string;
  },
): Promise<BookingStockCoverage> {
  const shortages: BookingStockShortage[] = [];
  const reservationStartByProduct = new Map<string, string>();
  const incomingMaxByProduct = await loadPendingIncomingMaxByProduct(prisma, {
    companyId: input.companyId,
    warehouseId: input.warehouseId,
    productIds: [...input.quantitiesByProduct.keys()],
    onOrAfterDate: input.dispatchMinString,
  });

  for (const [productId, entry] of input.quantitiesByProduct) {
    const projectionEnd = resolveCoverageProjectionEndDate(
      input.dispatchMaxString,
      [incomingMaxByProduct.get(productId)],
    );
    const projection = await getInventoryProjection({
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId,
      startDate: input.dispatchMinString,
      endDate: projectionEnd,
    });
    const reservationStart = findFeasibleReservationStartDate(
      projection,
      entry.qty,
    );
    if (reservationStart) {
      reservationStartByProduct.set(productId, reservationStart);
      continue;
    }

    const bestProjected = projection.length
      ? Math.max(...projection.map((day) => day.projectedAvailableQuantity))
      : 0;
    shortages.push({
      productId,
      displayName: entry.displayName,
      requiredQty: entry.qty,
      localProjectedAvailable: bestProjected,
      shortageQty: bookingShortageQty(entry.qty, bestProjected),
    });
  }

  if (shortages.length === 0) {
    return { shortages, coveringCompanyCodes: [], reservationStartByProduct };
  }

  const otherCompanies = await prisma.company.findMany({
    where: { id: { not: input.companyId }, isPractice: false },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });

  const coveringCompanyCodes: string[] = [];
  for (const company of otherCompanies) {
    let canCoverAll = true;
    for (const line of shortages) {
      const available = await getCompanyAvailableQty(prisma, company.id, line.productId);
      if (available < line.shortageQty) {
        canCoverAll = false;
        break;
      }
    }
    if (canCoverAll) coveringCompanyCodes.push(company.code);
  }

  return { shortages, coveringCompanyCodes, reservationStartByProduct };
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

export async function requestProformaInvoiceEdit(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    requestedById: string;
    customerId: string;
    notes?: string;
    issue?: boolean;
    lines: PiLineInput[];
    applyImmediately: boolean;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: {
      payments: true,
      items: true,
      editRequests: {
        where: { status: PiEditRequestStatus.PENDING },
        take: 1,
      },
    },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (
    !canEditProformaInvoice({
      status: pi.status,
      paymentCount: pi.payments.length,
      creditStatus: pi.creditStatus,
      hasPendingEdit: pi.editRequests.length > 0,
    })
  ) {
    throw new Error("INVALID_STATUS");
  }
  if (pi.quotationId && input.customerId !== pi.customerId) {
    throw new Error("CUSTOMER_LOCKED");
  }

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

  const proposedLines = await buildProposedPiEditLines(prisma, {
    companyId: input.companyId,
    lines: input.lines,
    piDate: pi.piDate,
  });
  const totalValue = roundMoney(proposedLines.reduce((sum, line) => sum + line.lineTotal, 0));

  if (
    piEditMatchesCurrent(
      pi,
      { customerId: input.customerId, notes: input.notes },
      proposedLines,
    )
  ) {
    throw new Error("NO_CHANGES");
  }

  if (input.applyImmediately) {
    return prisma.$transaction(async (tx) => {
      const updated = await applyProformaInvoiceEditTx(tx, {
        companyId: input.companyId,
        pi,
        performedById: input.requestedById,
        customerId: input.customerId,
        notes: input.notes,
        issue: input.issue,
        builtLines: proposedLines,
        totalValue,
      });
      return { mode: "APPLIED" as const, pi: serializePi(updated) };
    });
  }

  return prisma.$transaction(async (tx) => {
    const editRequest = await tx.proformaInvoiceEditRequest.create({
      data: {
        companyId: input.companyId,
        piId: pi.id,
        proposedCustomerId: input.customerId,
        proposedNotes: normalizePiNotes(input.notes),
        proposedIssue: Boolean(input.issue),
        proposedTotalValue: totalValue,
        proposedLines: proposedLines as unknown as Prisma.InputJsonValue,
        status: PiEditRequestStatus.PENDING,
        requestedById: input.requestedById,
      },
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.PI_EDIT,
        moduleId: editRequest.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: `PI edit for ${pi.piNo}`,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoice_edit_requests",
      recordId: editRequest.id,
      action: "CREATE",
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: pi.piNo,
      newValue: {
        proposedTotalValue: totalValue,
        proposedIssue: Boolean(input.issue),
        lineCount: proposedLines.length,
      },
    });

    await notifyPiEditApprovalNeeded(tx, {
      companyId: input.companyId,
      piNo: pi.piNo,
    });

    const refreshed = await tx.proformaInvoice.findFirstOrThrow({
      where: { id: pi.id },
      include: piInclude,
    });

    return { mode: "PENDING_APPROVAL" as const, pi: serializePi(refreshed) };
  });
}

export async function approveProformaInvoiceEdit(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const editRequest = await prisma.proformaInvoiceEditRequest.findFirst({
    where: {
      piId: input.piId,
      companyId: input.companyId,
      status: PiEditRequestStatus.PENDING,
    },
    include: {
      proformaInvoice: {
        include: { payments: true, items: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!editRequest) throw new Error("NO_PENDING_EDIT");

  const pi = editRequest.proformaInvoice;
  if (
    !canEditProformaInvoice({
      status: pi.status,
      paymentCount: pi.payments.length,
      creditStatus: pi.creditStatus,
    })
  ) {
    throw new Error("INVALID_STATUS");
  }

  const proposedLines = parseProposedPiEditLines(editRequest.proposedLines);
  const totalValue = roundMoney(proposedLines.reduce((sum, line) => sum + line.lineTotal, 0));

  return prisma.$transaction(async (tx) => {
    const updated = await applyProformaInvoiceEditTx(tx, {
      companyId: input.companyId,
      pi,
      performedById: input.approvedById,
      customerId: editRequest.proposedCustomerId,
      notes: editRequest.proposedNotes,
      issue: editRequest.proposedIssue,
      builtLines: proposedLines,
      totalValue,
    });

    await tx.proformaInvoiceEditRequest.update({
      where: { id: editRequest.id },
      data: {
        status: PiEditRequestStatus.APPROVED,
        decidedById: input.approvedById,
        decidedAt: new Date(),
        decisionRemarks: input.remarks?.trim() || null,
      },
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.PI_EDIT,
        moduleId: editRequest.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks?.trim() || undefined,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoice_edit_requests",
      recordId: editRequest.id,
      action: "APPROVE",
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: pi.piNo,
      newValue: { status: PiEditRequestStatus.APPROVED },
    });

    await notifyPiEditDecided(tx, {
      salesUserId: pi.salesUserId,
      piNo: pi.piNo,
      approved: true,
    });

    return serializePi(updated);
  });
}

export async function rejectProformaInvoiceEdit(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const editRequest = await prisma.proformaInvoiceEditRequest.findFirst({
    where: {
      piId: input.piId,
      companyId: input.companyId,
      status: PiEditRequestStatus.PENDING,
    },
    include: {
      proformaInvoice: { select: { piNo: true, salesUserId: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!editRequest) throw new Error("NO_PENDING_EDIT");

  return prisma.$transaction(async (tx) => {
    await tx.proformaInvoiceEditRequest.update({
      where: { id: editRequest.id },
      data: {
        status: PiEditRequestStatus.REJECTED,
        decidedById: input.rejectedById,
        decidedAt: new Date(),
        decisionRemarks: input.reason.trim(),
      },
    });

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.PI_EDIT,
        moduleId: editRequest.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        approvedById: input.rejectedById,
        remarks: input.reason.trim(),
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoice_edit_requests",
      recordId: editRequest.id,
      action: "UPDATE",
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: editRequest.proformaInvoice.piNo,
      newValue: { status: PiEditRequestStatus.REJECTED, reason: input.reason.trim() },
    });

    await notifyPiEditDecided(tx, {
      salesUserId: editRequest.proformaInvoice.salesUserId,
      piNo: editRequest.proformaInvoice.piNo,
      approved: false,
      reason: input.reason.trim(),
    });

    const refreshed = await tx.proformaInvoice.findFirstOrThrow({
      where: { id: input.piId },
      include: piInclude,
    });

    return serializePi(refreshed);
  });
}

export async function approveProformaInvoiceEditByRequestId(
  prisma: PrismaClient,
  input: {
    companyId: string;
    editRequestId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const editRequest = await prisma.proformaInvoiceEditRequest.findFirst({
    where: {
      id: input.editRequestId,
      companyId: input.companyId,
      status: PiEditRequestStatus.PENDING,
    },
  });
  if (!editRequest) throw new Error("NOT_FOUND");

  return approveProformaInvoiceEdit(prisma, {
    companyId: input.companyId,
    piId: editRequest.piId,
    approvedById: input.approvedById,
    remarks: input.remarks,
  });
}

export async function rejectProformaInvoiceEditByRequestId(
  prisma: PrismaClient,
  input: {
    companyId: string;
    editRequestId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const editRequest = await prisma.proformaInvoiceEditRequest.findFirst({
    where: {
      id: input.editRequestId,
      companyId: input.companyId,
      status: PiEditRequestStatus.PENDING,
    },
  });
  if (!editRequest) throw new Error("NOT_FOUND");

  return rejectProformaInvoiceEdit(prisma, {
    companyId: input.companyId,
    piId: editRequest.piId,
    rejectedById: input.rejectedById,
    reason: input.reason,
  });
}

/** @deprecated Use requestProformaInvoiceEdit instead. */
export async function updateProformaInvoice(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    performedById: string;
    customerId: string;
    notes?: string;
    issue?: boolean;
    lines: PiLineInput[];
    applyImmediately?: boolean;
  },
) {
  const result = await requestProformaInvoiceEdit(prisma, {
    companyId: input.companyId,
    piId: input.piId,
    requestedById: input.performedById,
    customerId: input.customerId,
    notes: input.notes,
    issue: input.issue,
    lines: input.lines,
    applyImmediately: input.applyImmediately ?? true,
  });
  return result.pi;
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

    await clearPiCreditIfPaid(tx, {
      companyId: input.companyId,
      piId: pi.id,
      performedById: input.recordedById,
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

    await clearPiCreditIfPaid(tx, {
      companyId: input.companyId,
      piId: pi.id,
      performedById: input.performedById,
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
    /** Manager approval may rely on available stock in other companies. */
    allowCrossCompanyShortfall?: boolean;
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

  const coverage = await assessBookingStockCoverage(prisma, {
    companyId: input.companyId,
    warehouseId,
    quantitiesByProduct,
    dispatchMinString,
    dispatchMaxString,
  });
  const decision = resolveBookingStockDecision({
    shortages: coverage.shortages,
    coveringCompanyCodes: coverage.coveringCompanyCodes,
    allowCrossCompanyShortfall: Boolean(input.allowCrossCompanyShortfall),
  });

  if (decision === "UNAVAILABLE") {
    const first = coverage.shortages[0]!;
    throw new Error(
      `INSUFFICIENT_PROJECTED_STOCK|${first.displayName}|${first.shortageQty}`,
    );
  }
  if (decision === "NEED_APPROVAL") {
    throw new Error(
      `CROSS_COMPANY_BOOKING_APPROVAL_REQUIRED|${coverage.coveringCompanyCodes.join(",")}`,
    );
  }

  const usingCrossCompanyShortfall = coverage.shortages.length > 0;

  // When coverage waits on incoming lots past the commercial max, stretch the
  // committed reservation window so expectedMin/Max stay ordered.
  const reservationStarts = [...coverage.reservationStartByProduct.values()];
  const effectiveDispatchMinString = reservationStarts.length
    ? reservationStarts.reduce((a, b) => (a < b ? a : b))
    : dispatchMinString;
  const effectiveDispatchMaxString = resolveCoverageProjectionEndDate(
    dispatchMaxString,
    reservationStarts,
  );
  const effectiveDispatchMinDate = new Date(
    `${effectiveDispatchMinString}T00:00:00.000Z`,
  );
  const effectiveDispatchMaxDate = new Date(
    `${effectiveDispatchMaxString}T00:00:00.000Z`,
  );

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
      allowCrossCompanyShortfall: usingCrossCompanyShortfall,
    });

    for (const [productId, entry] of quantitiesByProduct) {
      const reservationStart =
        coverage.reservationStartByProduct.get(productId) ?? dispatchMinString;
      const reservationEnd =
        reservationStart > dispatchMaxString
          ? reservationStart
          : dispatchMaxString;
      await createEvent(tx, {
        companyId: input.companyId,
        warehouseId,
        productId,
        eventType: InventoryEventType.BOOKING_RESERVATION,
        quantity: entry.qty,
        effectiveDate: bookingDate,
        expectedMinDate: new Date(`${reservationStart}T00:00:00.000Z`),
        expectedMaxDate: new Date(`${reservationEnd}T00:00:00.000Z`),
        sourceType: "PROFORMA_INVOICE",
        sourceId: pi.id,
        sourceNumber: pi.piNo,
        notes: usingCrossCompanyShortfall
          ? `Reserved for ${pi.piNo} (incl. cross-company cover from ${coverage.coveringCompanyCodes.join(", ")})`
          : `Reserved for ${pi.piNo}`,
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
        requiredDispatchMinDate: effectiveDispatchMinDate,
        requiredDispatchMaxDate: effectiveDispatchMaxDate,
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
      newValue: {
        status: ProformaInvoiceStatus.BOOKED,
        ...(usingCrossCompanyShortfall
          ? { crossCompanyCoverFrom: coverage.coveringCompanyCodes }
          : {}),
      },
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

async function submitCrossCompanyBookingForApproval(
  prisma: PrismaClient,
  input: {
    companyId: string;
    pi: BookingPiRecord;
    warehouseId: string;
    requestedById: string;
    coveringCompanyCodes: string[];
    shortages: BookingStockShortage[];
  },
) {
  const shortageSummary = input.shortages
    .map((row) => `${row.displayName} short ${row.shortageQty}`)
    .join("; ");
  const remarks =
    `Local stock short during dispatch window (${shortageSummary}). ` +
    `Coverable from ${input.coveringCompanyCodes.join(", ")}.`;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.proformaInvoice.update({
      where: { id: input.pi.id },
      data: {
        status: ProformaInvoiceStatus.PENDING_BOOKING,
        warehouseId: input.warehouseId,
      },
      include: piInclude,
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.BOOKING,
        moduleId: input.pi.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: input.pi.id,
      action: "UPDATE",
      oldValue: { status: ProformaInvoiceStatus.ISSUED },
      newValue: {
        status: ProformaInvoiceStatus.PENDING_BOOKING,
        crossCompanyCoverFrom: input.coveringCompanyCodes,
      },
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: input.pi.piNo,
    });

    await notifyBookingApprovalNeeded(tx, {
      companyId: input.companyId,
      piNo: input.pi.piNo,
      coveringCompanyCodes: input.coveringCompanyCodes,
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

  await assertCustomerCreditClear(prisma, {
    companyId: input.companyId,
    customerId: pi.customerId,
  });

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

  try {
    // Local projected stock sufficient — book immediately.
    return await completePiStockBooking(prisma, {
      companyId: input.companyId,
      pi,
      warehouseId: input.warehouseId,
      performedById: input.requestedById,
      requiredPaymentPercent: requirement.requiredPaymentPercent,
      auditAction: "UPDATE",
      allowCrossCompanyShortfall: false,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.startsWith("CROSS_COMPANY_BOOKING_APPROVAL_REQUIRED|")
    ) {
      throw error;
    }

    const coveringCompanyCodes = error.message
      .slice("CROSS_COMPANY_BOOKING_APPROVAL_REQUIRED|".length)
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);

    // Re-assess for shortage details used in the approval remark.
    const bookingDateString = new Date().toISOString().slice(0, 10);
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
        input.warehouseId,
        addCalendarDays(bookingDateString, minDays),
      ),
      workingDays.getNextWorkingDate(
        input.companyId,
        input.warehouseId,
        addCalendarDays(bookingDateString, maxDays),
      ),
    ]);
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
    const coverage = await assessBookingStockCoverage(prisma, {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      quantitiesByProduct,
      dispatchMinString,
      dispatchMaxString,
    });

    return submitCrossCompanyBookingForApproval(prisma, {
      companyId: input.companyId,
      pi,
      warehouseId: input.warehouseId,
      requestedById: input.requestedById,
      coveringCompanyCodes:
        coveringCompanyCodes.length > 0
          ? coveringCompanyCodes
          : coverage.coveringCompanyCodes,
      shortages: coverage.shortages,
    });
  }
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
    allowCrossCompanyShortfall: true,
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

async function restoreBookingReservationDates(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    piId: string;
    minDate: Date | null;
    maxDate: Date | null;
    updatedById: string;
  },
) {
  if (!input.minDate || !input.maxDate) return;
  await tx.inventoryEvent.updateMany({
    where: {
      companyId: input.companyId,
      sourceType: "PROFORMA_INVOICE",
      sourceId: input.piId,
      eventType: InventoryEventType.BOOKING_RESERVATION,
      status: InventoryEventStatus.ACTIVE,
    },
    data: {
      expectedMinDate: input.minDate,
      expectedMaxDate: input.maxDate,
      updatedById: input.updatedById,
    },
  });
}

async function cancelOpenCrossCompanyPlansForPi(
  tx: Prisma.TransactionClient,
  input: {
    piId: string;
    performedById: string;
    reason: string;
  },
) {
  const openPlans = await tx.piCrossCompanyTransferPlan.findMany({
    where: {
      piId: input.piId,
      status: {
        in: [
          PiCrossCompanyTransferPlanStatus.PENDING,
          PiCrossCompanyTransferPlanStatus.APPROVED,
        ],
      },
    },
    select: { id: true },
  });

  if (!openPlans.length) return;

  await tx.piCrossCompanyTransferPlan.updateMany({
    where: { id: { in: openPlans.map((row) => row.id) } },
    data: {
      status: PiCrossCompanyTransferPlanStatus.REJECTED,
      rejectionReason: input.reason,
    },
  });
  await tx.approvalRequest.updateMany({
    where: {
      moduleType: ApprovalModuleType.CROSS_COMPANY_TRANSFER,
      moduleId: { in: openPlans.map((row) => row.id) },
      status: ApprovalRequestStatus.PENDING,
    },
    data: {
      status: ApprovalRequestStatus.REJECTED,
      approvedById: input.performedById,
      remarks: input.reason,
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
 * future and/or PI-company stock is short, always creates a single pending
 * DISPATCH_TODAY approval (covering early dispatch and/or stock transfer)
 * — including for managers/admins. Dispatch panel only after approval.
 * When neither gate applies, activates immediately.
 */
export async function markDispatchToday(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    markedById: string;
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

  await assertCustomerCreditClear(prisma, {
    companyId: input.companyId,
    customerId: pi.customerId,
  });

  const totalPaid = pi.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  const outstanding = calculateOutstanding(decimalToNumber(pi.totalValue), totalPaid);
  if (
    !isReadyForDispatch(pi.status, outstanding, {
      hasApprovedCredit: hasApprovedPiCredit(pi.creditStatus),
    })
  ) {
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
  const committedDate = pi.requiredDispatchMinDate?.toISOString().slice(0, 10) ?? null;

  const fromCompany = needsCrossCompanyApproval
    ? await prisma.company.findUniqueOrThrow({
        where: { id: prepared.fromCompanyId! },
        select: { code: true },
      })
    : null;

  const approvalReasons = {
    daysUntil,
    needsEarly: needsEarlyApproval,
    fromCompanyCode: fromCompany?.code ?? null,
    committedDate,
  };

  const missingEarlyConfirm = needsEarlyApproval && !input.confirmEarly;
  const missingCrossCompanyConfirm =
    needsCrossCompanyApproval && !input.confirmCrossCompany;

  if (missingEarlyConfirm || missingCrossCompanyConfirm) {
    const confirmMessage = formatDispatchTodayConfirmationMessage(approvalReasons);
    throw new Error(
      `DISPATCH_TODAY_CONFIRMATION_REQUIRED|${JSON.stringify({
        needsEarly: needsEarlyApproval,
        daysUntil: daysUntil ?? 0,
        committedDate,
        needsCrossCompany: needsCrossCompanyApproval,
        fromCompanyCode: fromCompany?.code ?? null,
        message: confirmMessage,
      })}`,
    );
  }

  if (needsApproval) {
    const existing = await prisma.approvalRequest.findFirst({
      where: {
        moduleType: ApprovalModuleType.DISPATCH_TODAY,
        moduleId: pi.id,
        status: ApprovalRequestStatus.PENDING,
      },
    });
    if (existing) throw new Error("DISPATCH_TODAY_ALREADY_REQUESTED");

    const copy = buildDispatchTodayApprovalCopy(approvalReasons);

    return prisma.$transaction(async (tx) => {
      if (input.draft) {
        await tx.proformaInvoice.update({
          where: { id: pi.id },
          data: draftFieldsFromInput(input.draft),
        });
      }

      let planSerialized: SerializedPlan | null = null;
      if (needsCrossCompanyApproval) {
        // Keep plan PENDING under the single DISPATCH_TODAY approval —
        // do not create a separate CROSS_COMPANY_TRANSFER approval row.
        const plan = await createOrReplaceCrossCompanyPlan(tx, {
          piId: pi.id,
          toCompanyId: input.companyId,
          fromCompanyId: prepared.fromCompanyId!,
          shortfallLines: prepared.shortfallLines,
          requestedById: input.markedById,
          status: PiCrossCompanyTransferPlanStatus.PENDING,
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

      await tx.approvalRequest.create({
        data: {
          moduleType: ApprovalModuleType.DISPATCH_TODAY,
          moduleId: pi.id,
          requestedById: input.markedById,
          status: ApprovalRequestStatus.PENDING,
          remarks: copy.remarks,
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
          approvalRemarks: copy.remarks,
        },
        performedBy: input.markedById,
        companyId: input.companyId,
        reference: pi.piNo,
      });

      await notifyDispatchTodayApprovalNeeded(tx, {
        companyId: input.companyId,
        piNo: pi.piNo,
        daysUntil: daysUntil ?? 0,
        needsEarly: needsEarlyApproval,
        fromCompanyCode: fromCompany?.code ?? null,
        title: copy.title,
        message: formatDispatchTodayApprovalMessage(pi.piNo, approvalReasons),
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

  // No early/cross-company gate — activate immediately for any role that can mark.
  return prisma.$transaction(async (tx) => {
    const updated = await activateDispatchToday(tx, {
      companyId: input.companyId,
      piId: pi.id,
      piNo: pi.piNo,
      markedById: input.markedById,
      draft: input.draft,
    });
    return serializePi(updated, {
      pendingDispatchTodayApproval: false,
      crossCompanyTransfer: null,
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
  if (
    !isReadyForDispatch(pi.status, outstanding, {
      hasApprovedCredit: hasApprovedPiCredit(pi.creditStatus),
    })
  ) {
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

/**
 * Sales withdraws a pending dispatch-today approval or clears an active
 * dispatch-today mark (before warehouse has started / completed a DC).
 */
export async function recallDispatchToday(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    recalledById: string;
    reason?: string;
  },
) {
  await clearExpiredDispatchTodayFlags(prisma, input.companyId, input.piId);

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");

  const todayString = toDateOnly(new Date()).toISOString().slice(0, 10);
  const active = isDispatchTodayActive(pi.dispatchTodayDate, todayString);

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.DISPATCH_TODAY,
      moduleId: pi.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });

  if (!active && !pending) {
    throw new Error("NOTHING_TO_RECALL");
  }

  const blockingDispatch = await prisma.dispatch.findFirst({
    where: {
      proformaInvoiceId: pi.id,
      status: {
        in: [DispatchStatus.DRAFT, DispatchStatus.CANCEL_PENDING],
      },
    },
    select: { id: true, status: true },
  });
  if (blockingDispatch) throw new Error("HAS_ACTIVE_DISPATCH");

  const completedPlan = await prisma.piCrossCompanyTransferPlan.findFirst({
    where: {
      piId: pi.id,
      status: PiCrossCompanyTransferPlanStatus.COMPLETED,
    },
    select: { id: true },
  });
  if (completedPlan) throw new Error("TRANSFER_ALREADY_COMPLETED");

  const reason = input.reason?.trim() || "Dispatch today recalled by sales";

  return prisma.$transaction(async (tx) => {
    if (pending) {
      await tx.approvalRequest.update({
        where: { id: pending.id },
        data: {
          status: ApprovalRequestStatus.REJECTED,
          approvedById: input.recalledById,
          remarks: reason,
        },
      });
    }

    await cancelOpenCrossCompanyPlansForPi(tx, {
      piId: pi.id,
      performedById: input.recalledById,
      reason,
    });

    if (active) {
      await restoreBookingReservationDates(tx, {
        companyId: input.companyId,
        piId: pi.id,
        minDate: pi.requiredDispatchMinDate,
        maxDate: pi.requiredDispatchMaxDate,
        updatedById: input.recalledById,
      });
    }

    const updated = await tx.proformaInvoice.update({
      where: { id: pi.id },
      data: {
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

    await writeAuditLogTx(tx, {
      tableName: "proforma_invoices",
      recordId: pi.id,
      action: "UPDATE",
      newValue: {
        decision: "RECALLED",
        module: "DISPATCH_TODAY",
        reason,
        wasActive: active,
        hadPendingApproval: Boolean(pending),
      },
      performedBy: input.recalledById,
      companyId: input.companyId,
      reference: pi.piNo,
    });

    if (active) {
      await notifyWarehouseDispatchTodayRecalled(tx, {
        companyId: input.companyId,
        piNo: pi.piNo,
      });
    }

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

