import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  DispatchStatus,
  InventoryEventStatus,
  InventoryEventType,
  InventoryTransactionType,
  PiCrossCompanyTransferPlanStatus,
  Prisma,
  ProformaInvoiceStatus,
  SerialStatus,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import {
  assertSerialsMatchApprovedPlan,
  completeCrossCompanyTransferOnDispatch,
  completeInterchangeableSerialSwapOnDispatch,
} from "@/lib/cross-company-transfer-service";
import {
  generateDispatchNumber,
  getRemainingQty,
  toDateOnly,
} from "@/lib/dispatches";
import { decimalToNumber, normalizeSerialNumber } from "@/lib/inventory";
import { toSignedInventoryQuantity } from "@/lib/inventory-events";
import { createEvent } from "@/lib/inventory-event-service";
import {
  componentRemainingQty,
  loadKitBomMap,
  resolveKitDispatchQty,
  type KitBomComponent,
} from "@/lib/kit-fulfillment";
import {
  notifyDispatchCompleted,
  notifyInvoicePending,
} from "@/lib/notification-service";
import { calculateOutstanding } from "@/lib/proforma-invoices";
import { clearExpiredDispatchTodayFlags } from "@/lib/pi-service";
import { deductNonSerialStock } from "@/lib/transfer-service";
import {
  loadKitBomMapForDispatches,
  sumCommercialValueFromDispatchLines,
} from "@/lib/dispatch-value";
import { roundMoney } from "@/lib/quotations";
import { recalculateModuleMasteryForDispatch } from "@/lib/module-mastery-service";
import { isKitCategory } from "@/lib/products";
import { getKitComponentsForFulfillment } from "@/lib/product-service";

export const dispatchInclude = {
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
      contactPersonName: true,
      customerCode: true,
      gstNumber: true,
      address: true,
      city: true,
      state: true,
      pinCode: true,
      mobile: true,
    },
  },
  proformaInvoice: { select: { id: true, piNo: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  dispatchedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          serialTracking: true,
          hsn: true,
          pricingType: true,
          capacity: true,
        },
      },
      proformaInvoiceItem: {
        select: {
          id: true,
          qty: true,
          dispatchedQty: true,
          rate: true,
          gstRate: true,
          product: {
            select: {
              id: true,
              pricingType: true,
              capacity: true,
              category: { select: { name: true } },
            },
          },
        },
      },
      serials: {
        include: {
          serial: {
            select: { id: true, serialNumber: true },
          },
        },
      },
    },
  },
} satisfies Prisma.DispatchInclude;

export type DispatchRecord = Prisma.DispatchGetPayload<{
  include: typeof dispatchInclude;
}>;

type DispatchLineInput = {
  proformaInvoiceItemId: string;
  productId: string;
  qty: number;
  serialIds?: string[];
};

function serializeDispatch(
  dispatch: DispatchRecord,
  kitBomMap: ReadonlyMap<string, KitBomComponent[]> = new Map(),
) {
  return {
    id: dispatch.id,
    dcNo: dispatch.dcNo,
    status: dispatch.status,
    dispatchDate: dispatch.dispatchDate.toISOString().slice(0, 10),
    vehicleNo: dispatch.vehicleNo,
    driverName: dispatch.driverName,
    receiverName: dispatch.receiverName,
    receiverMobile: dispatch.receiverMobile,
    signatureUrl: dispatch.signatureUrl,
    notes: dispatch.notes,
    dispatchedAt: dispatch.dispatchedAt?.toISOString() ?? null,
    customer: dispatch.customer,
    proformaInvoice: dispatch.proformaInvoice,
    warehouse: dispatch.warehouse,
    createdBy: dispatch.createdBy,
    dispatchedBy: dispatch.dispatchedBy,
    lines: dispatch.lines.map((line) => ({
      id: line.id,
      qty: decimalToNumber(line.qty),
      product: line.product,
      proformaInvoiceItem: {
        id: line.proformaInvoiceItem.id,
        orderedQty: decimalToNumber(line.proformaInvoiceItem.qty),
        dispatchedQty: decimalToNumber(line.proformaInvoiceItem.dispatchedQty),
        rate: decimalToNumber(line.proformaInvoiceItem.rate),
      },
      serials: line.serials.map((entry) => ({
        id: entry.serial.id,
        serialNumber: entry.serial.serialNumber,
      })),
    })),
    totalValue: roundMoney(
      sumCommercialValueFromDispatchLines(
        dispatch.lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          product: line.product,
          proformaInvoiceItem: line.proformaInvoiceItem,
        })),
        kitBomMap,
      ),
    ),
  };
}

async function serializeDispatchWithKits(
  prisma: PrismaClient | Prisma.TransactionClient,
  dispatch: DispatchRecord,
) {
  const kitBomMap = await loadKitBomMapForDispatches(prisma, [dispatch]);
  return serializeDispatch(dispatch, kitBomMap);
}

async function refreshPiDispatchStatus(
  tx: Prisma.TransactionClient,
  piId: string,
) {
  const pi = await tx.proformaInvoice.findUniqueOrThrow({
    where: { id: piId },
    include: { items: true },
  });

  const allDispatched = pi.items.every(
    (item) => decimalToNumber(item.dispatchedQty) >= decimalToNumber(item.qty),
  );
  const anyDispatched = pi.items.some((item) => decimalToNumber(item.dispatchedQty) > 0);

  let status = pi.status;
  if (allDispatched) {
    status = ProformaInvoiceStatus.FULLY_DISPATCHED;
  } else if (anyDispatched) {
    status = ProformaInvoiceStatus.PARTIALLY_DISPATCHED;
  } else if (
    pi.status === ProformaInvoiceStatus.PARTIALLY_DISPATCHED ||
    pi.status === ProformaInvoiceStatus.FULLY_DISPATCHED
  ) {
    status = ProformaInvoiceStatus.BOOKED;
  }

  if (status !== pi.status || allDispatched) {
    await tx.proformaInvoice.update({
      where: { id: piId },
      data: {
        status,
        ...(allDispatched
          ? {
              dispatchTodayDate: null,
              dispatchTodayMarkedAt: null,
              dispatchTodayMarkedById: null,
            }
          : {}),
      },
    });
  }

  // Safety net: release any remaining booking reservations when the PI is
  // fully dispatched. releaseFullyDispatchedBookingReservations only releases
  // per-product when dispatched qty covers the original event qty, which can
  // fail if products were added/removed after booking.
  if (status === ProformaInvoiceStatus.FULLY_DISPATCHED) {
    const staleReservations = await tx.inventoryEvent.findMany({
      where: {
        sourceType: "PROFORMA_INVOICE",
        sourceId: piId,
        eventType: InventoryEventType.BOOKING_RESERVATION,
        status: { not: InventoryEventStatus.CANCELLED },
        replacedBy: { none: { eventType: InventoryEventType.BOOKING_RELEASE, status: { not: InventoryEventStatus.CANCELLED } } },
      },
    });
    for (const reservation of staleReservations) {
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
        notes: `Auto-released: PI fully dispatched`,
        createdById: reservation.createdById,
      });
    }
  }
}

export async function listDispatches(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    status?: DispatchStatus;
    customerId?: string;
    proformaInvoiceId?: string;
    salesUserId?: string;
    fromDate?: string;
    toDate?: string;
  },
) {
  const fromDate = filters.fromDate ? toDateOnly(new Date(filters.fromDate)) : undefined;
  const toDate = filters.toDate ? toDateOnly(new Date(filters.toDate)) : undefined;

  const rows = await prisma.dispatch.findMany({
    where: {
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.proformaInvoiceId
        ? { proformaInvoiceId: filters.proformaInvoiceId }
        : {}),
      ...(filters.salesUserId
        ? { proformaInvoice: { salesUserId: filters.salesUserId } }
        : {}),
      ...(fromDate || toDate
        ? {
            dispatchDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { dcNo: { contains: filters.q, mode: "insensitive" } },
              { customer: { customerName: { contains: filters.q, mode: "insensitive" } } },
              { proformaInvoice: { piNo: { contains: filters.q, mode: "insensitive" } } },
              { vehicleNo: { contains: filters.q, mode: "insensitive" } },
              { receiverName: { contains: filters.q, mode: "insensitive" } },
              { driverName: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: dispatchInclude,
    orderBy: [{ dispatchDate: "desc" }, { createdAt: "desc" }],
  });

  const kitBomMap = await loadKitBomMapForDispatches(prisma, rows);
  return rows.map((row) => serializeDispatch(row, kitBomMap));
}

export async function listPiDispatchedChallans(
  prisma: PrismaClient,
  companyId: string,
  proformaInvoiceId: string,
) {
  const rows = await prisma.dispatch.findMany({
    where: {
      companyId,
      proformaInvoiceId,
      status: DispatchStatus.DISPATCHED,
    },
    select: {
      id: true,
      dcNo: true,
      dispatchDate: true,
      invoiceHandover: {
        select: {
          invoiceNumber: true,
          invoiceDate: true,
        },
      },
      documentation: {
        select: {
          status: true,
        },
      },
    },
    orderBy: [{ dispatchDate: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((dispatch) => ({
    id: dispatch.id,
    dcNo: dispatch.dcNo,
    dispatchDate: dispatch.dispatchDate.toISOString().slice(0, 10),
    invoiceNumber: dispatch.invoiceHandover?.invoiceNumber ?? null,
    invoiceDate: dispatch.invoiceHandover?.invoiceDate?.toISOString().slice(0, 10) ?? null,
    documentationStatus: dispatch.documentation?.status ?? null,
  }));
}

export async function getDispatchById(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: dispatchId, companyId },
    include: dispatchInclude,
  });
  if (!dispatch) return null;
  return serializeDispatchWithKits(prisma, dispatch);
}

export async function getDispatchRecord(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
): Promise<DispatchRecord | null> {
  return prisma.dispatch.findFirst({
    where: { id: dispatchId, companyId },
    include: dispatchInclude,
  });
}

export async function listDispatchableProformaInvoices(
  prisma: PrismaClient,
  companyId: string,
) {
  await clearExpiredDispatchTodayFlags(prisma, companyId);

  const today = toDateOnly(new Date());
  const rows = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      status: {
        in: [ProformaInvoiceStatus.BOOKED, ProformaInvoiceStatus.PARTIALLY_DISPATCHED],
      },
      dispatchTodayDate: today,
    },
    include: {
      customer: { select: { id: true, customerName: true, customerCode: true } },
      warehouse: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
      dispatchTodayMarkedBy: { select: { id: true, name: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              displayName: true,
              serialTracking: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = [];
  for (const pi of rows) {
    const totalPaid = pi.payments.reduce(
      (sum, payment) => sum + decimalToNumber(payment.amount),
      0,
    );
    const outstanding = calculateOutstanding(decimalToNumber(pi.totalValue), totalPaid);

    const items = [];
    for (const item of pi.items) {
      const remainingKits = getRemainingQty(
        decimalToNumber(item.qty),
        decimalToNumber(item.dispatchedQty),
      );
      if (remainingKits <= 0) continue;

      if (isKitCategory(item.product.category.name)) {
        const components = await getKitComponentsForFulfillment(prisma, item.productId);
        for (const component of components) {
          items.push({
            id: item.id,
            productId: component.componentProductId,
            productName: `${component.displayName} (from ${item.product.displayName})`,
            kitProductName: item.product.displayName,
            serialTracking: component.serialTracking,
            orderedQty: decimalToNumber(item.qty) * component.qty,
            dispatchedQty: decimalToNumber(item.dispatchedQty) * component.qty,
            remainingQty: componentRemainingQty(remainingKits, component.qty),
            isKitComponent: true,
            kitBomQty: component.qty,
          });
        }
      } else {
        items.push({
          id: item.id,
          productId: item.productId,
          productName: item.product.displayName,
          kitProductName: null,
          serialTracking: item.product.serialTracking,
          orderedQty: decimalToNumber(item.qty),
          dispatchedQty: decimalToNumber(item.dispatchedQty),
          remainingQty: remainingKits,
          isKitComponent: false,
          kitBomQty: null,
        });
      }
    }

    result.push({
      id: pi.id,
      piNo: pi.piNo,
      status: pi.status,
      customer: pi.customer,
      warehouse: pi.warehouse,
      outstanding,
      dispatchTodayMarkedBy: pi.dispatchTodayMarkedBy,
      crossCompanyTransfer: null as null | {
        fromCompanyCode: string;
        fromCompanyName: string;
        lines: Array<{ displayName: string; qty: number }>;
      },
      draft: {
        vehicleNo: pi.dispatchDraftVehicleNo,
        driverName: pi.dispatchDraftDriverName,
        receiverName: pi.dispatchDraftReceiverName,
        receiverMobile: pi.dispatchDraftReceiverMobile,
        notes: pi.dispatchDraftNotes,
      },
      items,
    });
  }

  const piIds = result.map((row) => row.id);
  if (piIds.length > 0) {
    const plans = await prisma.piCrossCompanyTransferPlan.findMany({
      where: {
        piId: { in: piIds },
        status: PiCrossCompanyTransferPlanStatus.APPROVED,
      },
      include: {
        fromCompany: { select: { code: true, name: true } },
        lines: {
          include: { product: { select: { displayName: true } } },
        },
      },
    });
    const planByPi = new Map(plans.map((plan) => [plan.piId, plan]));
    for (const row of result) {
      const plan = planByPi.get(row.id);
      if (!plan) continue;
      row.crossCompanyTransfer = {
        fromCompanyCode: plan.fromCompany.code,
        fromCompanyName: plan.fromCompany.name,
        lines: plan.lines.map((line) => ({
          displayName: line.product.displayName,
          qty: decimalToNumber(line.qty),
        })),
      };
    }
  }

  // SE already gated payment/credit when marking Dispatch Today — do not re-block on outstanding.
  return result.filter((pi) => pi.items.some((item) => item.remainingQty > 0));
}

export async function listBookedSerialsForPi(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    productId: string;
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");

  // Serials are not pre-linked to the PI; list available units of the product from any warehouse.
  return prisma.inventorySerial.findMany({
    where: {
      productId: input.productId,
      status: SerialStatus.AVAILABLE,
    },
    select: { id: true, serialNumber: true, status: true },
    orderBy: { serialNumber: "asc" },
  });
}

export async function lookupBookedSerialForDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    serialNumber: string;
    productId?: string;
  },
) {
  const result = await lookupSerialsForDispatch(prisma, {
    companyId: input.companyId,
    piId: input.piId,
    productId: input.productId,
    serialNumbers: [input.serialNumber],
  });
  if (result.valid[0]) return result.valid[0];
  const reason = result.invalid[0]?.reason;
  if (reason?.includes("different product")) throw new Error("WRONG_PRODUCT");
  throw new Error("SERIAL_NOT_FOUND");
}

export async function lookupSerialsForDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    productId?: string;
    serialNumbers: string[];
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
  });
  if (!pi) throw new Error("NOT_FOUND");

  const valid: Array<{
    id: string;
    serialNumber: string;
    product: { id: string; displayName: string; serialTracking: boolean };
  }> = [];
  const invalid: Array<{ serialNumber: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const raw of input.serialNumbers) {
    const serialNumber = normalizeSerialNumber(raw);
    if (!serialNumber) continue;

    if (seen.has(serialNumber)) {
      invalid.push({ serialNumber, reason: "Duplicate in list." });
      continue;
    }
    seen.add(serialNumber);

    // Any AVAILABLE serial of the matching product (any warehouse) may be used.
    // Legacy: BOOKED serials already linked to this PI remain valid until released.
    // Serial ↔ PI link for AVAILABLE units is created when the DC is saved.
    const serial = await prisma.inventorySerial.findFirst({
      where: {
        serialNumber,
        OR: [
          { status: SerialStatus.AVAILABLE },
          {
            status: SerialStatus.BOOKED,
            proformaInvoiceSerials: { some: { piId: input.piId } },
          },
        ],
      },
      include: {
        product: {
          select: { id: true, displayName: true, serialTracking: true },
        },
      },
    });

    if (!serial) {
      const existing = await prisma.inventorySerial.findFirst({
        where: { serialNumber },
        select: { id: true, status: true, productId: true },
      });
      if (!existing) {
        invalid.push({ serialNumber, reason: "Serial not found." });
      } else if (input.productId && existing.productId !== input.productId) {
        invalid.push({ serialNumber, reason: "Belongs to a different product." });
      } else {
        invalid.push({
          serialNumber,
          reason: "Not available (already reserved or dispatched).",
        });
      }
      continue;
    }

    if (input.productId && serial.productId !== input.productId) {
      invalid.push({
        serialNumber,
        reason: "Belongs to a different product.",
      });
      continue;
    }

    valid.push({
      id: serial.id,
      serialNumber: serial.serialNumber,
      product: serial.product,
    });
  }

  return { valid, invalid };
}

async function validateDispatchLines(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    warehouseId: string;
    lines: DispatchLineInput[];
  },
) {
  if (input.lines.length === 0) throw new Error("LINES_REQUIRED");

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.piId, companyId: input.companyId },
    include: {
      items: { include: { product: { include: { category: true } } } },
    },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (
    pi.status !== ProformaInvoiceStatus.BOOKED &&
    pi.status !== ProformaInvoiceStatus.PARTIALLY_DISPATCHED
  ) {
    throw new Error("INVALID_PI_STATUS");
  }

  // SE already gated payment/credit (incl. ₹10 tolerance / approved credit) when marking
  // Dispatch Today — warehouse DC creation must not re-block on outstanding.
  const today = toDateOnly(new Date());
  if (
    !pi.dispatchTodayDate ||
    pi.dispatchTodayDate.toISOString().slice(0, 10) !== today.toISOString().slice(0, 10)
  ) {
    throw new Error("NOT_MARKED_DISPATCH_TODAY");
  }

  if (pi.warehouseId !== input.warehouseId) throw new Error("WAREHOUSE_MISMATCH");

  const serialIdsForPlanCheck = input.lines.flatMap((line) => line.serialIds ?? []);
  await assertSerialsMatchApprovedPlan(prisma, {
    piId: input.piId,
    piCompanyId: input.companyId,
    serialIds: serialIdsForPlanCheck,
  });

  const kitProductIds = pi.items
    .filter((item) => isKitCategory(item.product.category.name))
    .map((item) => item.productId);
  const kitBomMap = await loadKitBomMap(prisma, kitProductIds);

  // For kits, all BOM components must be dispatched together for the same kit qty.
  const linesByPiItem = new Map<string, typeof input.lines>();
  for (const line of input.lines) {
    const group = linesByPiItem.get(line.proformaInvoiceItemId) ?? [];
    group.push(line);
    linesByPiItem.set(line.proformaInvoiceItemId, group);
  }

  for (const [piItemId, groupLines] of linesByPiItem) {
    const piItem = pi.items.find((item) => item.id === piItemId);
    if (!piItem) throw new Error("INVALID_LINE");

    if (isKitCategory(piItem.product.category.name)) {
      const bom = kitBomMap.get(piItem.productId) ?? [];
      resolveKitDispatchQty({
        kitOrderedQty: decimalToNumber(piItem.qty),
        kitDispatchedQty: decimalToNumber(piItem.dispatchedQty),
        bom,
        lines: groupLines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
        })),
      });

      for (const line of groupLines) {
        if (line.qty <= 0) throw new Error("INVALID_QUANTITY");
        const component = bom.find((c) => c.componentProductId === line.productId);
        if (!component) throw new Error("INVALID_LINE");

        if (component.serialTracking) {
          const serialIds = line.serialIds ?? [];
          if (serialIds.length !== Math.ceil(line.qty)) throw new Error("SERIAL_REQUIRED");

          const selectable = await prisma.inventorySerial.findMany({
            where: {
              id: { in: serialIds },
              productId: line.productId,
              OR: [
                { status: SerialStatus.AVAILABLE },
                {
                  status: SerialStatus.BOOKED,
                  proformaInvoiceSerials: { some: { piId: input.piId } },
                },
              ],
            },
          });
          if (selectable.length !== serialIds.length) throw new Error("INVALID_SERIAL_SELECTION");
        }
      }
      continue;
    }

    if (groupLines.length !== 1) throw new Error("INVALID_LINE");
    const line = groupLines[0]!;
    if (line.qty <= 0) throw new Error("INVALID_QUANTITY");
    if (piItem.productId !== line.productId) throw new Error("INVALID_LINE");

    const remaining = getRemainingQty(
      decimalToNumber(piItem.qty),
      decimalToNumber(piItem.dispatchedQty),
    );
    if (line.qty > remaining) throw new Error("EXCEEDS_REMAINING_QTY");

    if (piItem.product.serialTracking) {
      const serialIds = line.serialIds ?? [];
      if (serialIds.length !== Math.ceil(line.qty)) throw new Error("SERIAL_REQUIRED");

      const selectable = await prisma.inventorySerial.findMany({
        where: {
          id: { in: serialIds },
          productId: line.productId,
          OR: [
            { status: SerialStatus.AVAILABLE },
            {
              status: SerialStatus.BOOKED,
              proformaInvoiceSerials: { some: { piId: input.piId } },
            },
          ],
        },
      });
      if (selectable.length !== serialIds.length) throw new Error("INVALID_SERIAL_SELECTION");
    }
  }

  return pi;
}

export async function createDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proformaInvoiceId: string;
    createdById: string;
    vehicleNo?: string;
    driverName?: string;
    receiverName?: string;
    receiverMobile?: string;
    signatureUrl?: string;
    notes?: string;
    confirm: boolean;
    lines: DispatchLineInput[];
  },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: input.proformaInvoiceId, companyId: input.companyId },
    include: { company: true },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (!pi.warehouseId) throw new Error("WAREHOUSE_REQUIRED");

  await validateDispatchLines(prisma, {
    companyId: input.companyId,
    piId: pi.id,
    warehouseId: pi.warehouseId,
    lines: input.lines,
  });

  const dispatchDate = toDateOnly(new Date());
  const dcNo = await generateDispatchNumber(
    prisma,
    pi.company.code,
    input.companyId,
    dispatchDate,
  );

  // Create + confirm can include cross-company transfer / interchangeable serial
  // swap work (common for Waaree modules). Default interactive timeout (5s) is too low.
  return prisma.$transaction(
    async (tx) => {
      const serialIds = input.lines.flatMap((line) => line.serialIds ?? []);
      if (serialIds.length > 0) {
        const uniqueIds = [...new Set(serialIds)];
        if (uniqueIds.length !== serialIds.length) throw new Error("INVALID_SERIAL_SELECTION");

        const selectable = await tx.inventorySerial.findMany({
          where: {
            id: { in: uniqueIds },
            OR: [
              { status: SerialStatus.AVAILABLE },
              {
                status: SerialStatus.BOOKED,
                proformaInvoiceSerials: { some: { piId: pi.id } },
              },
            ],
          },
        });
        if (selectable.length !== uniqueIds.length) throw new Error("INVALID_SERIAL_SELECTION");

        for (const line of input.lines) {
          if (!line.serialIds?.length) continue;
          const wrongProduct = selectable.some(
            (serial) => line.serialIds!.includes(serial.id) && serial.productId !== line.productId,
          );
          if (wrongProduct) throw new Error("INVALID_SERIAL_SELECTION");
        }
      }

      const dispatch = await tx.dispatch.create({
        data: {
          dcNo,
          companyId: input.companyId,
          customerId: pi.customerId,
          proformaInvoiceId: pi.id,
          warehouseId: pi.warehouseId!,
          status: DispatchStatus.DRAFT,
          dispatchDate,
          vehicleNo: input.vehicleNo,
          driverName: input.driverName,
          receiverName: input.receiverName,
          receiverMobile: input.receiverMobile,
          signatureUrl: input.signatureUrl,
          notes: input.notes,
          createdById: input.createdById,
          lines: {
            create: input.lines.map((line) => ({
              proformaInvoiceItemId: line.proformaInvoiceItemId,
              productId: line.productId,
              qty: line.qty,
              serials: line.serialIds?.length
                ? {
                    create: line.serialIds.map((serialId) => ({ serialId })),
                  }
                : undefined,
            })),
          },
        },
        include: dispatchInclude,
      });

      // Assign selected serials to this PI when they are recorded on the DC.
      if (serialIds.length > 0) {
        await tx.proformaInvoiceSerial.createMany({
          data: serialIds.map((serialId) => ({
            piId: pi.id,
            serialId,
          })),
          skipDuplicates: true,
        });
        await tx.inventorySerial.updateMany({
          where: { id: { in: serialIds }, status: SerialStatus.AVAILABLE },
          data: { status: SerialStatus.BOOKED },
        });
      }

      await writeAuditLogTx(tx, {
        tableName: "dispatches",
        recordId: dispatch.id,
        action: "CREATE",
        newValue: { dcNo: dispatch.dcNo, status: dispatch.status },
        performedBy: input.createdById,
        companyId: input.companyId,
        reference: dispatch.dcNo,
      });

      if (input.confirm) {
        return confirmDispatchTx(tx, {
          companyId: input.companyId,
          dispatchId: dispatch.id,
          performedById: input.createdById,
        });
      }

      return serializeDispatchWithKits(tx, dispatch);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

/**
 * Once dispatched qty for a PI product covers its booking reservation, release
 * the reservation so live-physical projection does not keep deducting it.
 */
async function releaseFullyDispatchedBookingReservations(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    piId: string;
    piNo: string;
    productIds: string[];
    performedById: string;
  },
) {
  if (input.productIds.length === 0) return;

  const reservations = await tx.inventoryEvent.findMany({
    where: {
      companyId: input.companyId,
      sourceType: "PROFORMA_INVOICE",
      sourceId: input.piId,
      productId: { in: input.productIds },
      eventType: InventoryEventType.BOOKING_RESERVATION,
      status: { not: InventoryEventStatus.CANCELLED },
    },
  });
  if (reservations.length === 0) return;

  const dispatches = await tx.dispatch.findMany({
    where: {
      proformaInvoiceId: input.piId,
      status: DispatchStatus.DISPATCHED,
    },
    select: { id: true },
  });
  const dispatchIds = dispatches.map((row) => row.id);
  if (dispatchIds.length === 0) return;

  const actuals = await tx.inventoryEvent.findMany({
    where: {
      companyId: input.companyId,
      productId: { in: input.productIds },
      eventType: InventoryEventType.ACTUAL_DISPATCH,
      sourceType: "DISPATCH",
      sourceId: { in: dispatchIds },
      status: { not: InventoryEventStatus.CANCELLED },
    },
    select: { productId: true, quantity: true },
  });
  const dispatchedQtyByProduct = new Map<string, number>();
  for (const actual of actuals) {
    dispatchedQtyByProduct.set(
      actual.productId,
      (dispatchedQtyByProduct.get(actual.productId) ?? 0) +
        decimalToNumber(actual.quantity),
    );
  }

  for (const reservation of reservations) {
    const dispatchedQty = dispatchedQtyByProduct.get(reservation.productId) ?? 0;
    if (dispatchedQty + 1e-9 < decimalToNumber(reservation.quantity)) continue;

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
      notes: `Released booking after dispatch for ${input.piNo}`,
      createdById: input.performedById,
    });
  }
}

async function confirmDispatchTx(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    dispatchId: string;
    performedById: string;
  },
) {
  const dispatch = await tx.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: {
      customer: { select: { customerName: true } },
      proformaInvoice: { select: { salesUserId: true, piNo: true } },
      lines: {
        include: {
          product: true,
          proformaInvoiceItem: {
            include: { product: { include: { category: true } } },
          },
          serials: true,
        },
      },
    },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== DispatchStatus.DRAFT) throw new Error("INVALID_STATUS");
  if (
    !dispatch.vehicleNo?.trim() ||
    !dispatch.receiverName?.trim() ||
    !dispatch.receiverMobile?.trim()
  ) {
    throw new Error("MANDATORY_DISPATCH_FIELDS_REQUIRED");
  }

  const kitProductIds = dispatch.lines
    .filter((line) => isKitCategory(line.proformaInvoiceItem.product.category.name))
    .map((line) => line.proformaInvoiceItem.productId);
  const kitBomMap = await loadKitBomMap(tx, kitProductIds);

  const linesByPiItem = new Map<string, typeof dispatch.lines>();
  for (const line of dispatch.lines) {
    const group = linesByPiItem.get(line.proformaInvoiceItemId) ?? [];
    group.push(line);
    linesByPiItem.set(line.proformaInvoiceItemId, group);
  }

  const piItemKitQty = new Map<string, number>();
  for (const [piItemId, groupLines] of linesByPiItem) {
    const piItem = groupLines[0]!.proformaInvoiceItem;
    if (isKitCategory(piItem.product.category.name)) {
      const bom = kitBomMap.get(piItem.productId) ?? [];
      const kitQty = resolveKitDispatchQty({
        kitOrderedQty: decimalToNumber(piItem.qty),
        kitDispatchedQty: decimalToNumber(piItem.dispatchedQty),
        bom,
        lines: groupLines.map((line) => ({
          productId: line.productId,
          qty: decimalToNumber(line.qty),
        })),
      });
      piItemKitQty.set(piItemId, kitQty);
    } else {
      const line = groupLines[0]!;
      const qty = decimalToNumber(line.qty);
      const remaining = getRemainingQty(
        decimalToNumber(piItem.qty),
        decimalToNumber(piItem.dispatchedQty),
      );
      if (qty > remaining) throw new Error("EXCEEDS_REMAINING_QTY");
      piItemKitQty.set(piItemId, qty);
    }
  }

  const pi = await tx.proformaInvoice.findUniqueOrThrow({
    where: { id: dispatch.proformaInvoiceId },
    select: { piNo: true },
  });

  await completeCrossCompanyTransferOnDispatch(tx, {
    companyId: input.companyId,
    piId: dispatch.proformaInvoiceId,
    piNo: pi.piNo,
    dispatchId: dispatch.id,
    dcNo: dispatch.dcNo,
    toWarehouseId: dispatch.warehouseId,
    performedById: input.performedById,
    lines: dispatch.lines.map((line) => ({
      productId: line.productId,
      qty: decimalToNumber(line.qty),
      serialTracking: line.product.serialTracking,
      serialIds: line.serials.map((entry) => entry.serialId),
    })),
  });

  await completeInterchangeableSerialSwapOnDispatch(tx, {
    companyId: input.companyId,
    piNo: pi.piNo,
    dispatchId: dispatch.id,
    dcNo: dispatch.dcNo,
    performedById: input.performedById,
    lines: dispatch.lines.map((line) => ({
      productId: line.productId,
      serialTracking: line.product.serialTracking,
      serialIds: line.serials.map((entry) => entry.serialId),
    })),
  });

  for (const line of dispatch.lines) {
    const qty = decimalToNumber(line.qty);

    if (line.product.serialTracking) {
      const serialIds = line.serials.map((entry) => entry.serialId);
      // Serials were linked to the PI and marked BOOKED when recorded on the DC.
      const linked = await tx.proformaInvoiceSerial.findMany({
        where: {
          piId: dispatch.proformaInvoiceId,
          serialId: { in: serialIds },
          serial: { status: SerialStatus.BOOKED },
        },
      });
      if (linked.length !== serialIds.length) throw new Error("INVALID_SERIAL_SELECTION");

      await tx.inventorySerial.updateMany({
        where: { id: { in: serialIds } },
        data: { status: SerialStatus.DISPATCHED },
      });
    } else {
      await deductNonSerialStock(tx, {
        companyId: input.companyId,
        warehouseId: dispatch.warehouseId,
        productId: line.productId,
        qty,
      });
    }

    await tx.inventoryTransaction.create({
      data: {
        transactionType: InventoryTransactionType.DISPATCH,
        companyId: input.companyId,
        productId: line.productId,
        qty,
        fromWarehouseId: dispatch.warehouseId,
        referenceType: "DISPATCH",
        referenceId: dispatch.id,
        notes: [
          dispatch.customer.customerName,
          dispatch.dcNo,
          pi.piNo,
        ].join(" - "),
        createdById: input.performedById,
      },
    });

    const existingActualEvent = await tx.inventoryEvent.findFirst({
      where: {
        sourceType: "DISPATCH",
        sourceId: dispatch.id,
        productId: line.productId,
        eventType: InventoryEventType.ACTUAL_DISPATCH,
        status: { not: InventoryEventStatus.CANCELLED },
      },
    });
    if (!existingActualEvent) {
      await tx.inventoryEvent.create({
        data: {
          companyId: input.companyId,
          warehouseId: dispatch.warehouseId,
          productId: line.productId,
          eventType: InventoryEventType.ACTUAL_DISPATCH,
          quantity: qty,
          quantityEffect: toSignedInventoryQuantity(InventoryEventType.ACTUAL_DISPATCH, qty),
          effectiveDate: dispatch.dispatchDate,
          sourceType: "DISPATCH",
          sourceId: dispatch.id,
          sourceNumber: dispatch.dcNo,
          status: InventoryEventStatus.COMPLETED,
          createdById: input.performedById,
        },
      });
    }

    await tx.inventoryEvent.updateMany({
      where: {
        sourceType: "DISPATCH",
        sourceId: dispatch.id,
        productId: line.productId,
        eventType: InventoryEventType.PLANNED_DISPATCH,
        status: InventoryEventStatus.ACTIVE,
      },
      data: {
        status: InventoryEventStatus.COMPLETED,
        updatedById: input.performedById,
      },
    });
  }

  await releaseFullyDispatchedBookingReservations(tx, {
    companyId: input.companyId,
    piId: dispatch.proformaInvoiceId,
    piNo: pi.piNo,
    productIds: [...new Set(dispatch.lines.map((line) => line.productId))],
    performedById: input.performedById,
  });

  for (const [piItemId, qtyToAdd] of piItemKitQty) {
    const piItem = dispatch.lines.find(
      (line) => line.proformaInvoiceItemId === piItemId,
    )!.proformaInvoiceItem;
    await tx.proformaInvoiceItem.update({
      where: { id: piItemId },
      data: {
        dispatchedQty: decimalToNumber(piItem.dispatchedQty) + qtyToAdd,
      },
    });
  }

  const updated = await tx.dispatch.update({
    where: { id: dispatch.id },
    data: {
      status: DispatchStatus.DISPATCHED,
      dispatchedById: input.performedById,
      dispatchedAt: new Date(),
    },
    include: dispatchInclude,
  });

  await refreshPiDispatchStatus(tx, dispatch.proformaInvoiceId);

  await tx.invoiceHandover.upsert({
    where: { dispatchId: dispatch.id },
    create: {
      dispatchId: dispatch.id,
      companyId: dispatch.companyId,
      customerId: dispatch.customerId,
      status: "PENDING_INVOICE",
    },
    update: {},
  });

  await writeAuditLogTx(tx, {
    tableName: "dispatches",
    recordId: dispatch.id,
    action: "UPDATE",
    oldValue: { status: DispatchStatus.DRAFT },
    newValue: { status: DispatchStatus.DISPATCHED },
    performedBy: input.performedById,
    companyId: input.companyId,
    reference: dispatch.dcNo,
  });

  await Promise.all([
    notifyDispatchCompleted(tx, {
      salesUserId: dispatch.proformaInvoice.salesUserId,
      dcNo: dispatch.dcNo,
    }),
    notifyInvoicePending(tx, {
      companyId: input.companyId,
      dcNo: dispatch.dcNo,
    }),
  ]);

  return serializeDispatchWithKits(tx, updated);
}

export async function confirmDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    performedById: string;
  },
) {
  const result = await prisma.$transaction((tx) => confirmDispatchTx(tx, input), {
    maxWait: 10_000,
    timeout: 60_000,
  });

  try {
    await recalculateModuleMasteryForDispatch(prisma, {
      companyId: input.companyId,
      dispatchId: input.dispatchId,
    });
  } catch (error) {
    console.error("Module Mastery recalculation failed after dispatch confirm", error);
  }

  return result;
}

export async function requestDispatchCancel(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    requestedById: string;
    remarks?: string;
  },
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== DispatchStatus.DISPATCHED) throw new Error("INVALID_STATUS");

  const existing = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.DC_CANCEL,
      moduleId: dispatch.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (existing) throw new Error("CANCEL_ALREADY_REQUESTED");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.dispatch.update({
      where: { id: dispatch.id },
      data: { status: DispatchStatus.CANCEL_PENDING },
      include: dispatchInclude,
    });

    await tx.approvalRequest.create({
      data: {
        moduleType: ApprovalModuleType.DC_CANCEL,
        moduleId: dispatch.id,
        requestedById: input.requestedById,
        status: ApprovalRequestStatus.PENDING,
        remarks: input.remarks,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "dispatches",
      recordId: dispatch.id,
      action: "UPDATE",
      newValue: { status: DispatchStatus.CANCEL_PENDING },
      performedBy: input.requestedById,
      companyId: input.companyId,
      reference: dispatch.dcNo,
    });

    return serializeDispatchWithKits(tx, updated);
  });
}

export async function approveDispatchCancel(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    approvedById: string;
    remarks?: string;
  },
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
    include: {
      lines: {
        include: {
          product: true,
          proformaInvoiceItem: {
            include: { product: { include: { category: true } } },
          },
          serials: true,
        },
      },
    },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== DispatchStatus.CANCEL_PENDING) throw new Error("INVALID_STATUS");

  const result = await prisma.$transaction(async (tx) => {
    const kitProductIds = dispatch.lines
      .filter((line) => isKitCategory(line.proformaInvoiceItem.product.category.name))
      .map((line) => line.proformaInvoiceItem.productId);
    const kitBomMap = await loadKitBomMap(tx, kitProductIds);

    const linesByPiItem = new Map<string, typeof dispatch.lines>();
    for (const line of dispatch.lines) {
      const group = linesByPiItem.get(line.proformaInvoiceItemId) ?? [];
      group.push(line);
      linesByPiItem.set(line.proformaInvoiceItemId, group);
    }

    const piItemQtyToReverse = new Map<string, number>();
    for (const [piItemId, groupLines] of linesByPiItem) {
      const piItem = groupLines[0]!.proformaInvoiceItem;
      if (isKitCategory(piItem.product.category.name)) {
        const bom = kitBomMap.get(piItem.productId) ?? [];
        // Use already-dispatched kit math: treat current dispatched as ceiling for reverse.
        const kitQty = resolveKitDispatchQty({
          kitOrderedQty: decimalToNumber(piItem.qty),
          kitDispatchedQty: 0,
          bom,
          lines: groupLines.map((line) => ({
            productId: line.productId,
            qty: decimalToNumber(line.qty),
          })),
        });
        piItemQtyToReverse.set(piItemId, kitQty);
      } else {
        piItemQtyToReverse.set(piItemId, decimalToNumber(groupLines[0]!.qty));
      }
    }

    for (const line of dispatch.lines) {
      const qty = decimalToNumber(line.qty);

      if (line.product.serialTracking) {
        const serialIds = line.serials.map((entry) => entry.serialId);
        await tx.inventorySerial.updateMany({
          where: { id: { in: serialIds } },
          data: { status: SerialStatus.AVAILABLE },
        });
        await tx.proformaInvoiceSerial.deleteMany({
          where: {
            piId: dispatch.proformaInvoiceId,
            serialId: { in: serialIds },
          },
        });
      }

      await tx.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.ADJUST,
          companyId: input.companyId,
          productId: line.productId,
          qty,
          toWarehouseId: dispatch.warehouseId,
          referenceType: "DISPATCH_CANCEL",
          referenceId: dispatch.id,
          notes: `Cancelled dispatch ${dispatch.dcNo}`,
          createdById: input.approvedById,
        },
      });
    }

    for (const [piItemId, qtyToReverse] of piItemQtyToReverse) {
      const piItem = dispatch.lines.find(
        (line) => line.proformaInvoiceItemId === piItemId,
      )!.proformaInvoiceItem;
      await tx.proformaInvoiceItem.update({
        where: { id: piItemId },
        data: {
          dispatchedQty: Math.max(0, decimalToNumber(piItem.dispatchedQty) - qtyToReverse),
        },
      });
    }

    const updated = await tx.dispatch.update({
      where: { id: dispatch.id },
      data: { status: DispatchStatus.CANCELLED },
      include: dispatchInclude,
    });

    await refreshPiDispatchStatus(tx, dispatch.proformaInvoiceId);

    await tx.approvalRequest.updateMany({
      where: {
        moduleType: ApprovalModuleType.DC_CANCEL,
        moduleId: dispatch.id,
        status: ApprovalRequestStatus.PENDING,
      },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        approvedById: input.approvedById,
        remarks: input.remarks,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "dispatches",
      recordId: dispatch.id,
      action: "CANCEL",
      newValue: { status: DispatchStatus.CANCELLED },
      performedBy: input.approvedById,
      companyId: input.companyId,
      reference: dispatch.dcNo,
    });

    return serializeDispatchWithKits(tx, updated);
  });

  try {
    await recalculateModuleMasteryForDispatch(prisma, {
      companyId: input.companyId,
      dispatchId: input.dispatchId,
    });
  } catch (error) {
    console.error("Module Mastery recalculation failed after dispatch cancel", error);
  }

  return result;
}

export async function rejectDispatchCancel(
  prisma: PrismaClient,
  input: {
    companyId: string;
    dispatchId: string;
    rejectedById: string;
    reason: string;
  },
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: input.dispatchId, companyId: input.companyId },
  });
  if (!dispatch) throw new Error("NOT_FOUND");
  if (dispatch.status !== DispatchStatus.CANCEL_PENDING) throw new Error("INVALID_STATUS");

  const pending = await prisma.approvalRequest.findFirst({
    where: {
      moduleType: ApprovalModuleType.DC_CANCEL,
      moduleId: dispatch.id,
      status: ApprovalRequestStatus.PENDING,
    },
  });
  if (!pending) throw new Error("NO_PENDING_APPROVAL");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.dispatch.update({
      where: { id: dispatch.id },
      data: { status: DispatchStatus.DISPATCHED },
      include: dispatchInclude,
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
      tableName: "dispatches",
      recordId: dispatch.id,
      action: "UPDATE",
      oldValue: { status: DispatchStatus.CANCEL_PENDING },
      newValue: {
        status: DispatchStatus.DISPATCHED,
        decision: "REJECTED",
        reason: input.reason,
      },
      performedBy: input.rejectedById,
      companyId: input.companyId,
      reference: dispatch.dcNo,
    });

    return serializeDispatchWithKits(tx, updated);
  });
}

export async function countTodaysDispatches(prisma: PrismaClient, companyId: string) {
  const today = toDateOnly(new Date());
  return prisma.dispatch.count({
    where: {
      companyId,
      status: DispatchStatus.DISPATCHED,
      dispatchDate: today,
    },
  });
}

export async function countPendingDispatchCancels(prisma: PrismaClient, companyId: string) {
  return prisma.dispatch.count({
    where: { companyId, status: DispatchStatus.CANCEL_PENDING },
  });
}

export async function getCustomerDispatchMetrics(
  prisma: PrismaClient,
  companyId: string,
  customerId: string,
) {
  const dispatches = await prisma.dispatch.findMany({
    where: {
      companyId,
      customerId,
      status: DispatchStatus.DISPATCHED,
    },
    include: {
      lines: {
        include: {
          proformaInvoiceItem: {
            select: {
              id: true,
              rate: true,
              gstRate: true,
              product: {
                select: {
                  id: true,
                  pricingType: true,
                  capacity: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
          product: { select: { pricingType: true, capacity: true } },
        },
      },
    },
  });

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const kitBomMap = await loadKitBomMapForDispatches(prisma, dispatches);
  let totalDispatchValueThisYear = 0;

  for (const dispatch of dispatches) {
    if (dispatch.dispatchedAt && dispatch.dispatchedAt >= yearStart) {
      totalDispatchValueThisYear += sumCommercialValueFromDispatchLines(
        dispatch.lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          product: line.product,
          proformaInvoiceItem: line.proformaInvoiceItem,
        })),
        kitBomMap,
      );
    }
  }

  return {
    totalDispatchValueThisYear: roundMoney(totalDispatchValueThisYear),
    dispatchCount: dispatches.length,
  };
}
