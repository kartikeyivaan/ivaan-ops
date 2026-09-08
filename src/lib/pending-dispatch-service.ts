import {
  DispatchStatus,
  PiCrossCompanyTransferPlanStatus,
  ProformaInvoiceStatus,
  type PrismaClient,
} from "@prisma/client";
import { getBusinessToday, parseBusinessDate } from "@/lib/business-dates";
import {
  buildDispatchFormItems,
  createDispatch,
} from "@/lib/dispatch-service";
import { decimalToNumber } from "@/lib/inventory";
import { getRemainingQty } from "@/lib/dispatches";
import {
  canCloseFromPendingDispatch,
  canRecordQueuedDispatchOnPi,
  canRequestCancelFromPendingDispatch,
  daysOnPendingDispatch,
  historicDispatchDateWindow,
  isHistoricDispatchDateAllowed,
  isPendingDispatchListStatus,
} from "@/lib/proforma-invoices";

const pendingDispatchInclude = {
  customer: { select: { id: true, customerName: true, customerCode: true } },
  warehouse: { select: { id: true, name: true } },
  salesUser: { select: { id: true, name: true } },
  dispatchQueuedBy: { select: { id: true, name: true } },
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
  dispatches: {
    where: {
      status: { in: [DispatchStatus.DRAFT, DispatchStatus.CANCEL_PENDING] },
    },
    select: { id: true, dcNo: true, status: true },
    take: 1,
  },
};

function remainingQtyOnPi(
  items: Array<{ qty: { toNumber(): number } | number | string; dispatchedQty: { toNumber(): number } | number | string }>,
): number {
  return items.reduce(
    (sum, item) =>
      sum + getRemainingQty(decimalToNumber(item.qty), decimalToNumber(item.dispatchedQty)),
    0,
  );
}

export async function listPendingDispatchPis(
  prisma: PrismaClient,
  companyId: string,
  options?: { salesUserId?: string },
) {
  const rows = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      dispatchQueuedAt: { not: null },
      status: {
        in: [
          ProformaInvoiceStatus.BOOKED,
          ProformaInvoiceStatus.PARTIALLY_DISPATCHED,
          ProformaInvoiceStatus.CANCEL_PENDING,
        ],
      },
      ...(options?.salesUserId ? { salesUserId: options.salesUserId } : {}),
    },
    include: pendingDispatchInclude,
    orderBy: [{ dispatchQueuedAt: "asc" }, { createdAt: "asc" }],
  });

  const dateWindow = historicDispatchDateWindow();

  return {
    dateWindow,
    items: rows
      .filter((pi) => isPendingDispatchListStatus(pi.status))
      .map((pi) => {
        const remainingQty = remainingQtyOnPi(pi.items);
        const hasOpenDispatchDraft = pi.dispatches.length > 0;
        const queuedAt = pi.dispatchQueuedAt
          ? getBusinessToday(pi.dispatchQueuedAt)
          : null;
        return {
          id: pi.id,
          piNo: pi.piNo,
          status: pi.status,
          customer: pi.customer,
          salesUser: pi.salesUser,
          queuedAt,
          queuedBy: pi.dispatchQueuedBy,
          daysWaiting: daysOnPendingDispatch(pi.dispatchQueuedAt),
          remainingQty,
          hasOpenDispatchDraft,
          openDispatch: pi.dispatches[0]
            ? { id: pi.dispatches[0].id, dcNo: pi.dispatches[0].dcNo }
            : null,
          canRecordDispatch: canRecordQueuedDispatchOnPi({
            status: pi.status,
            hasOpenDispatchDraft,
          }),
          canRequestCancel: canRequestCancelFromPendingDispatch({
            status: pi.status,
            hasOpenDispatchDraft,
          }),
          canClosePartial: canCloseFromPendingDispatch({
            status: pi.status,
            hasOpenDispatchDraft,
          }),
          closeLines: pi.items.map((item) => ({
            id: item.id,
            displayName: item.product.displayName,
            qty: decimalToNumber(item.qty),
            dispatchedQty: decimalToNumber(item.dispatchedQty),
            remainingQty: getRemainingQty(
              decimalToNumber(item.qty),
              decimalToNumber(item.dispatchedQty),
            ),
          })),
        };
      })
      .filter((row) => row.remainingQty > 0 || row.status === "CANCEL_PENDING"),
  };
}

export async function getQueuedPiForDispatch(
  prisma: PrismaClient,
  companyId: string,
  piId: string,
  options?: { salesUserId?: string },
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: {
      id: piId,
      companyId,
      dispatchQueuedAt: { not: null },
      ...(options?.salesUserId ? { salesUserId: options.salesUserId } : {}),
    },
    include: pendingDispatchInclude,
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (!isPendingDispatchListStatus(pi.status)) throw new Error("INVALID_PI_STATUS");

  const hasOpenDispatchDraft = pi.dispatches.length > 0;
  if (!canRecordQueuedDispatchOnPi({ status: pi.status, hasOpenDispatchDraft })) {
    throw new Error(hasOpenDispatchDraft ? "HAS_OPEN_DISPATCH" : "INVALID_PI_STATUS");
  }

  const items = await buildDispatchFormItems(prisma, pi.items);
  if (!items.some((item) => item.remainingQty > 0)) {
    throw new Error("NOTHING_TO_DISPATCH");
  }

  const plan = await prisma.piCrossCompanyTransferPlan.findFirst({
    where: {
      piId: pi.id,
      status: PiCrossCompanyTransferPlanStatus.APPROVED,
    },
    include: {
      fromCompany: { select: { code: true, name: true } },
      lines: { include: { product: { select: { displayName: true } } } },
    },
  });

  return {
    dateWindow: historicDispatchDateWindow(),
    pi: {
      id: pi.id,
      piNo: pi.piNo,
      status: pi.status,
      customer: pi.customer,
      warehouse: pi.warehouse,
      dispatchTodayMarkedBy: null,
      crossCompanyTransfer: plan
        ? {
            fromCompanyCode: plan.fromCompany.code,
            fromCompanyName: plan.fromCompany.name,
            lines: plan.lines.map((line) => ({
              displayName: line.product.displayName,
              qty: decimalToNumber(line.qty),
            })),
          }
        : null,
      draft: {
        vehicleNo: pi.dispatchDraftVehicleNo,
        driverName: pi.dispatchDraftDriverName,
        receiverName: pi.dispatchDraftReceiverName,
        receiverMobile: pi.dispatchDraftReceiverMobile,
        notes: pi.dispatchDraftNotes,
      },
      items,
    },
  };
}

export async function createQueuedDispatch(
  prisma: PrismaClient,
  input: {
    companyId: string;
    piId: string;
    createdById: string;
    dispatchDate: string;
    vehicleNo?: string;
    driverName?: string;
    receiverName?: string;
    receiverMobile?: string;
    signatureUrl?: string;
    notes?: string;
    confirm: boolean;
    lines: Array<{
      proformaInvoiceItemId: string;
      productId: string;
      qty: number;
      serialIds?: string[];
    }>;
    salesUserId?: string;
  },
) {
  if (!isHistoricDispatchDateAllowed(input.dispatchDate)) {
    throw new Error("DISPATCH_DATE_OUT_OF_RANGE");
  }

  const pi = await prisma.proformaInvoice.findFirst({
    where: {
      id: input.piId,
      companyId: input.companyId,
      ...(input.salesUserId ? { salesUserId: input.salesUserId } : {}),
    },
    select: {
      id: true,
      status: true,
      dispatchQueuedAt: true,
    },
  });
  if (!pi) throw new Error("NOT_FOUND");
  if (!pi.dispatchQueuedAt) throw new Error("NOT_QUEUED_FOR_DISPATCH");
  if (!isPendingDispatchListStatus(pi.status)) throw new Error("INVALID_PI_STATUS");

  const openDispatch = await prisma.dispatch.findFirst({
    where: {
      proformaInvoiceId: pi.id,
      status: { in: [DispatchStatus.DRAFT, DispatchStatus.CANCEL_PENDING] },
    },
    select: { id: true },
  });
  if (openDispatch) throw new Error("HAS_OPEN_DISPATCH");

  return createDispatch(prisma, {
    companyId: input.companyId,
    proformaInvoiceId: pi.id,
    createdById: input.createdById,
    vehicleNo: input.vehicleNo,
    driverName: input.driverName,
    receiverName: input.receiverName,
    receiverMobile: input.receiverMobile,
    signatureUrl: input.signatureUrl,
    notes: input.notes,
    confirm: input.confirm,
    lines: input.lines,
    dispatchDate: parseBusinessDate(input.dispatchDate),
    skipDispatchTodayCheck: true,
  });
}
