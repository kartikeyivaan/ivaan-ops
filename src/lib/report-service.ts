import {
  CustomerType,
  DispatchStatus,
  InventoryTransactionType,
  ProformaInvoiceStatus,
  type PrismaClient,
} from "@prisma/client";
import { commercialValuesByDispatchLine, loadKitBomMapForDispatches } from "@/lib/dispatch-value";
import { decimalToNumber } from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import {
  calculateAdvanceRequired,
  resolveBookingRequirement,
} from "@/lib/proforma-invoices";
import { calculateLineAmounts, roundMoney } from "@/lib/quotations";
import {
  buildExecutiveKpiSummary,
  buildPaymentWhere,
  buildTeamKpiSummaries,
  listSalesExecutivesForCompany,
  toCompanyIdFilter,
  type SalesMetricFilters,
} from "@/lib/report-builders";
import { getBusinessMonthRange } from "@/lib/business-dates";
import {
  calculateModuleMasteryLevel,
  loadMasteryEngineConfig,
} from "@/lib/module-mastery-service";
import { getModuleTargetProgress } from "@/lib/sales-target-service";
import { getSalesFunnel } from "@/lib/sales-dashboard/funnel-service";
import {
  calculateAgeingDays,
  calculateFreeQty,
  calculateOutstanding,
  ageingBucketToPiDateFilter,
  endOfReportDay,
  getAgeingBucket,
  matchesAgeingBucket,
  parseReportDate,
  sumMovementClosing,
} from "@/lib/reports";

export type ReportDateFilters = {
  fromDate?: string;
  toDate?: string;
};

export type SalesExecutiveReportFilters = ReportDateFilters & {
  salesUserId?: string;
  customerType?: CustomerType;
};

export type PaymentFollowupFilters = ReportDateFilters & {
  salesUserId?: string;
  customerId?: string;
  ageingBucket?: string;
};

export type ProductMovementFilters = ReportDateFilters & {
  warehouseId?: string;
  productId?: string;
  q?: string;
};

export type BookedAvailableFilters = {
  warehouseId?: string;
  q?: string;
};

export type ReservedQtyFilters = {
  productId?: string;
  warehouseId?: string;
  q?: string;
};

export type ExecutivePerformanceReportFilters = SalesExecutiveReportFilters;

export type SalesPerformanceReportFilters = SalesExecutiveReportFilters;

export type SalesFunnelReportFilters = SalesExecutiveReportFilters;

export type CollectionReportFilters = PaymentFollowupFilters;

export type DispatchReportFilters = ReportDateFilters & {
  salesUserId?: string;
  warehouseId?: string;
  customerId?: string;
  q?: string;
};

export type ExecutiveSalesReportFilters = ReportDateFilters & {
  salesUserIds?: string[];
};

type MovementBucket = {
  opening: number;
  incoming: number;
  transfersIn: number;
  booked: number;
  damaged: number;
  dispatched: number;
  transfersOut: number;
};

function emptyMovement(): MovementBucket {
  return {
    opening: 0,
    incoming: 0,
    transfersIn: 0,
    booked: 0,
    damaged: 0,
    dispatched: 0,
    transfersOut: 0,
  };
}

function applyMovement(
  bucket: MovementBucket,
  tx: {
    transactionType: InventoryTransactionType;
    qty: string | number | { toNumber(): number };
    fromWarehouseId: string | null;
    toWarehouseId: string | null;
  },
  warehouseId: string,
  mode: "opening" | "period",
) {
  const qty = decimalToNumber(tx.qty);

  function add(field: keyof MovementBucket, value: number) {
    if (mode === "opening") {
      bucket.opening += value;
    } else {
      bucket[field] += value;
    }
  }

  switch (tx.transactionType) {
    case InventoryTransactionType.INWARD:
      if (tx.toWarehouseId === warehouseId) add("incoming", qty);
      break;
    case InventoryTransactionType.BOOK:
      if (tx.fromWarehouseId === warehouseId) add("booked", qty);
      break;
    case InventoryTransactionType.DISPATCH:
      if (tx.fromWarehouseId === warehouseId) add("dispatched", qty);
      break;
    case InventoryTransactionType.DAMAGE:
      if (tx.fromWarehouseId === warehouseId) add("damaged", qty);
      break;
    case InventoryTransactionType.TRANSFER:
      if (tx.fromWarehouseId === warehouseId) add("transfersOut", qty);
      if (tx.toWarehouseId === warehouseId) add("transfersIn", qty);
      break;
    case InventoryTransactionType.ADJUST:
      if (tx.toWarehouseId === warehouseId) add("incoming", qty);
      else if (tx.fromWarehouseId === warehouseId) add("dispatched", qty);
      break;
    default:
      break;
  }
}

export async function getSalesExecutiveReport(
  prisma: PrismaClient,
  companyId: string,
  filters: SalesExecutiveReportFilters,
) {
  const salesUsers = await listSalesExecutivesForCompany(
    prisma,
    companyId,
    filters.salesUserId,
  );

  const rows = await Promise.all(
    salesUsers.map((user) =>
      buildExecutiveKpiSummary(prisma, companyId, user, {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        customerType: filters.customerType,
      }),
    ),
  );

  return rows
    .filter(
      (row) =>
        row.quotationValue.actual > 0 ||
        row.piValue.actual > 0 ||
        row.collectionValue.actual > 0 ||
        row.dispatchedValue.actual > 0 ||
        row.newCustomers.actual > 0 ||
        Boolean(filters.salesUserId),
    )
    .map(({ moduleUnits, inverterUnits, otherUnits, ...reportRow }) => ({
      ...reportRow,
      quotationValue: reportRow.quotationValue.counted,
      quotationValueActual: reportRow.quotationValue.actual,
      piValue: reportRow.piValue.counted,
      piValueActual: reportRow.piValue.actual,
      collectionValue: reportRow.collectionValue.counted,
      collectionValueActual: reportRow.collectionValue.actual,
      dispatchedValue: reportRow.dispatchedValue.counted,
      dispatchedValueActual: reportRow.dispatchedValue.actual,
      newCustomers: reportRow.newCustomers.counted,
      newCustomersActual: reportRow.newCustomers.actual,
    }));
}

export async function getPaymentFollowupReport(
  prisma: PrismaClient,
  companyId: string,
  filters: PaymentFollowupFilters,
) {
  const fromDate = parseReportDate(filters.fromDate);
  const toDate = endOfReportDay(filters.toDate);
  const ageingPiDate = ageingBucketToPiDateFilter(filters.ageingBucket);

  let piDateGte = fromDate;
  let piDateLte = toDate;
  let piDateLt: Date | undefined;
  if (ageingPiDate?.gte) {
    piDateGte =
      !piDateGte || ageingPiDate.gte > piDateGte ? ageingPiDate.gte : piDateGte;
  }
  if (ageingPiDate?.lt) {
    piDateLt = ageingPiDate.lt;
  }
  if (ageingPiDate?.lte) {
    piDateLte =
      !piDateLte || ageingPiDate.lte < piDateLte ? ageingPiDate.lte : piDateLte;
  }

  const pis = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      status: {
        in: [
          ProformaInvoiceStatus.ISSUED,
          ProformaInvoiceStatus.PENDING_BOOKING,
          ProformaInvoiceStatus.BOOKED,
          ProformaInvoiceStatus.PARTIALLY_DISPATCHED,
          ProformaInvoiceStatus.FULLY_DISPATCHED,
        ],
      },
      ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(piDateGte || piDateLte || piDateLt
        ? {
            piDate: {
              ...(piDateGte ? { gte: piDateGte } : {}),
              ...(piDateLte ? { lte: piDateLte } : {}),
              ...(piDateLt ? { lt: piDateLt } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, customerName: true } },
      salesUser: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { piDate: "asc" },
  });

  return pis
    .map((pi) => {
      const piValue = decimalToNumber(pi.totalValue);
      const paid = roundMoney(
        pi.payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0),
      );
      const outstanding = calculateOutstanding(piValue, paid);
      const ageingDays = calculateAgeingDays(pi.piDate);
      const creditDueDate = pi.creditDueDate
        ? pi.creditDueDate.toISOString().slice(0, 10)
        : null;

      return {
        customerId: pi.customer.id,
        customerName: pi.customer.customerName,
        piId: pi.id,
        piNo: pi.piNo,
        piDate: pi.piDate.toISOString().slice(0, 10),
        piValue,
        paid,
        outstanding,
        ageingDays,
        ageingBucket: getAgeingBucket(ageingDays),
        salesExecutive: pi.salesUser.name,
        salesUserId: pi.salesUser.id,
        creditStatus: pi.creditStatus,
        creditDueDate,
      };
    })
    .filter((row) => row.outstanding > 0)
    .filter((row) => matchesAgeingBucket(row.ageingDays, filters.ageingBucket));
}

export async function getProductMovementReport(
  prisma: PrismaClient,
  companyId: string,
  filters: ProductMovementFilters,
) {
  const fromDate = parseReportDate(filters.fromDate);
  const toDate = endOfReportDay(filters.toDate);

  const warehouses = await prisma.warehouse.findMany({
    where: {
      companyId,
      isActive: true,
      ...(filters.warehouseId ? { id: filters.warehouseId } : {}),
    },
    orderBy: { name: "asc" },
  });

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(filters.productId ? { id: filters.productId } : {}),
      ...(filters.q
        ? {
            OR: [
              { displayName: { contains: filters.q, mode: "insensitive" } },
              { brand: { name: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { brand: true, category: true },
    orderBy: { displayName: "asc" },
  });

  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      companyId,
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.warehouseId
        ? {
            OR: [
              { fromWarehouseId: filters.warehouseId },
              { toWarehouseId: filters.warehouseId },
            ],
          }
        : {}),
      // Keep txs before fromDate for opening balance; drop only those after toDate.
      ...(toDate ? { createdAt: { lte: toDate } } : {}),
    },
    select: {
      productId: true,
      transactionType: true,
      qty: true,
      fromWarehouseId: true,
      toWarehouseId: true,
      createdAt: true,
    },
  });

  const rows: Array<{
    productId: string;
    productName: string;
    brandName: string;
    categoryName: string;
    warehouseId: string;
    warehouseName: string;
    opening: number;
    incoming: number;
    transfersIn: number;
    booked: number;
    dispatched: number;
    damaged: number;
    transfersOut: number;
    closing: number;
  }> = [];

  for (const product of products) {
    for (const warehouse of warehouses) {
      const bucket = emptyMovement();

      for (const tx of transactions.filter((row) => row.productId === product.id)) {
        const inPeriod =
          (!fromDate || tx.createdAt >= fromDate) && (!toDate || tx.createdAt <= toDate);
        const beforePeriod = fromDate ? tx.createdAt < fromDate : false;

        if (beforePeriod) {
          applyMovement(bucket, tx, warehouse.id, "opening");
        } else if (inPeriod || (!fromDate && !toDate)) {
          applyMovement(bucket, tx, warehouse.id, "period");
        }
      }

      const closing = sumMovementClosing(bucket);
      const hasActivity =
        bucket.opening !== 0 ||
        bucket.incoming !== 0 ||
        bucket.transfersIn !== 0 ||
        bucket.booked !== 0 ||
        bucket.dispatched !== 0 ||
        bucket.damaged !== 0 ||
        bucket.transfersOut !== 0 ||
        closing !== 0;

      if (!hasActivity && !filters.q && !filters.productId) continue;

      rows.push({
        productId: product.id,
        productName: product.displayName,
        brandName: product.brand.name,
        categoryName: product.category.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        opening: bucket.opening,
        incoming: bucket.incoming,
        transfersIn: bucket.transfersIn,
        booked: bucket.booked,
        dispatched: bucket.dispatched,
        damaged: bucket.damaged,
        transfersOut: bucket.transfersOut,
        closing,
      });
    }
  }

  return rows;
}

export async function getBookedAvailableReport(
  prisma: PrismaClient,
  companyId: string,
  filters: BookedAvailableFilters,
) {
  const warehouses = await prisma.warehouse.findMany({
    where: {
      companyId,
      isActive: true,
      ...(filters.warehouseId ? { id: filters.warehouseId } : {}),
    },
    orderBy: { name: "asc" },
  });

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(filters.q
        ? {
            OR: [
              { displayName: { contains: filters.q, mode: "insensitive" } },
              { brand: { name: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { brand: true },
    orderBy: { displayName: "asc" },
  });

  const rows: Array<{
    productId: string;
    productName: string;
    brandName: string;
    warehouseId: string;
    warehouseName: string;
    available: number;
    incoming: number;
    booked: number;
    freeQty: number;
  }> = [];

  for (const product of products) {
    for (const warehouse of warehouses) {
      const stock = await getWarehouseStockForProduct(
        prisma,
        companyId,
        product.id,
        warehouse.id,
      );
      const freeQty = calculateFreeQty(
        stock.availableStock,
        stock.bookedStock,
        stock.incomingStock,
      );

      if (
        stock.availableStock === 0 &&
        stock.incomingStock === 0 &&
        stock.bookedStock === 0 &&
        !filters.q
      ) {
        continue;
      }

      rows.push({
        productId: product.id,
        productName: product.displayName,
        brandName: product.brand.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        available: stock.availableStock,
        incoming: stock.incomingStock,
        booked: stock.bookedStock,
        freeQty,
      });
    }
  }

  return rows;
}

export async function getReservedQtyReport(
  prisma: PrismaClient,
  companyId: string,
  filters: ReservedQtyFilters,
) {
  const search = filters.q?.trim();
  const items = await prisma.proformaInvoiceItem.findMany({
    where: {
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(search
        ? {
            OR: [
              {
                product: {
                  displayName: { contains: search, mode: "insensitive" },
                },
              },
              {
                product: {
                  brand: { name: { contains: search, mode: "insensitive" } },
                },
              },
              {
                proformaInvoice: {
                  customer: {
                    customerName: { contains: search, mode: "insensitive" },
                  },
                },
              },
              {
                proformaInvoice: {
                  piNo: { contains: search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
      proformaInvoice: {
        companyId,
        status: {
          in: [
            ProformaInvoiceStatus.BOOKED,
            ProformaInvoiceStatus.PARTIALLY_DISPATCHED,
          ],
        },
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
    },
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          capacity: true,
          pricingType: true,
          gstRate: true,
        },
      },
      proformaInvoice: {
        select: {
          id: true,
          piNo: true,
          totalValue: true,
          bookedAt: true,
          requiredDispatchMinDate: true,
          requiredPaymentPercent: true,
          deliveryTermMode: true,
          bookingAllowed: true,
          customer: { select: { customerName: true } },
          quotation: {
            select: {
              deliveryTermMode: true,
              bookingAllowed: true,
              requiredPaymentPercent: true,
            },
          },
        },
      },
    },
    orderBy: [
      { product: { displayName: "asc" } },
      { proformaInvoice: { requiredDispatchMinDate: "asc" } },
      { proformaInvoice: { bookedAt: "asc" } },
    ],
  });

  const rows: Array<{
    committedDate: string;
    customerName: string;
    productName: string;
    piNo: string;
    totalQty: number;
    totalAmount: number;
    ratePerWp: number;
    bookingAmount: number;
    piId: string;
    productId: string;
  }> = [];

  for (const item of items) {
    const qty = decimalToNumber(item.qty);
    const dispatchedQty = decimalToNumber(item.dispatchedQty);
    const totalQty = Math.max(0, qty - dispatchedQty);
    if (totalQty <= 0) continue;

    const rate = decimalToNumber(item.rate);
    const capacity = decimalToNumber(item.product.capacity);
    const gstRate = decimalToNumber(item.product.gstRate);
    const amounts = calculateLineAmounts({
      pricingType: item.product.pricingType,
      capacity,
      qty: totalQty,
      rate,
      gstRate,
    });

    const pi = item.proformaInvoice;
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

    const committed =
      pi.requiredDispatchMinDate ?? pi.bookedAt ?? null;

    rows.push({
      committedDate: committed ? committed.toISOString().slice(0, 10) : "—",
      customerName: pi.customer.customerName,
      productName: item.product.displayName,
      piNo: pi.piNo,
      totalQty,
      totalAmount: amounts.lineTotal,
      ratePerWp: rate,
      bookingAmount: calculateAdvanceRequired(
        decimalToNumber(pi.totalValue),
        requirement.requiredPaymentPercent,
      ),
      piId: pi.id,
      productId: item.product.id,
    });
  }

  return rows;
}

export async function getDispatchReport(
  prisma: PrismaClient,
  companyId: string,
  filters: DispatchReportFilters,
) {
  const fromDate = parseReportDate(filters.fromDate);
  const toDate = endOfReportDay(filters.toDate);

  const dispatches = await prisma.dispatch.findMany({
    where: {
      companyId,
      status: DispatchStatus.DISPATCHED,
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
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
            ],
          }
        : {}),
    },
    include: {
      customer: {
        select: {
          customerName: true,
          customerCode: true,
          gstNumber: true,
          address: true,
          city: true,
          state: true,
          pinCode: true,
          mobile: true,
        },
      },
      warehouse: { select: { name: true } },
      proformaInvoice: {
        select: {
          piNo: true,
          piDate: true,
          totalValue: true,
          salesUser: { select: { id: true, name: true } },
        },
      },
      lines: {
        include: {
          product: {
            select: {
              id: true,
              displayName: true,
              pricingType: true,
              capacity: true,
            },
          },
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
          serials: {
            include: {
              serial: { select: { serialNumber: true } },
            },
          },
        },
      },
    },
    orderBy: [{ dispatchDate: "asc" }, { dcNo: "asc" }],
  });

  const rows: Array<{
    dispatchDate: string;
    dcNo: string;
    piNo: string;
    piDate: string;
    firmName: string;
    firmCode: string;
    firmGst: string;
    firmAddress: string;
    firmMobile: string;
    executiveName: string;
    productName: string;
    qty: number;
    serialNumbers: string;
    vehicleNo: string;
    warehouseName: string;
    value: number;
  }> = [];

  const kitBomMap = await loadKitBomMapForDispatches(prisma, dispatches);

  for (const dispatch of dispatches) {
    const firmAddress = [
      dispatch.customer.address,
      dispatch.customer.city,
      dispatch.customer.state,
      dispatch.customer.pinCode,
    ]
      .filter(Boolean)
      .join(", ");

    const lineValues = commercialValuesByDispatchLine(
      dispatch.lines.map((line) => ({
        productId: line.productId,
        qty: line.qty,
        product: line.product,
        proformaInvoiceItem: line.proformaInvoiceItem,
      })),
      kitBomMap,
    );

    for (let index = 0; index < dispatch.lines.length; index += 1) {
      const line = dispatch.lines[index]!;
      const qty = decimalToNumber(line.qty);
      rows.push({
        dispatchDate: dispatch.dispatchDate.toISOString().slice(0, 10),
        dcNo: dispatch.dcNo,
        piNo: dispatch.proformaInvoice.piNo,
        piDate: dispatch.proformaInvoice.piDate.toISOString().slice(0, 10),
        firmName: dispatch.customer.customerName,
        firmCode: dispatch.customer.customerCode,
        firmGst: dispatch.customer.gstNumber,
        firmAddress,
        firmMobile: dispatch.customer.mobile ?? "",
        executiveName: dispatch.proformaInvoice.salesUser.name,
        productName: line.product.displayName,
        qty,
        serialNumbers: line.serials
          .map((entry) => entry.serial.serialNumber)
          .sort((a, b) => a.localeCompare(b))
          .join(", "),
        vehicleNo: dispatch.vehicleNo ?? "",
        warehouseName: dispatch.warehouse.name,
        value: roundMoney(lineValues[index] ?? 0),
      });
    }
  }

  return rows;
}

export async function getExecutiveSalesReport(
  prisma: PrismaClient,
  companyIds: string[],
  filters: ExecutiveSalesReportFilters,
) {
  const fromDate = parseReportDate(filters.fromDate);
  const toDate = endOfReportDay(filters.toDate);

  const dispatches = await prisma.dispatch.findMany({
    where: {
      companyId: toCompanyIdFilter(companyIds),
      status: DispatchStatus.DISPATCHED,
      ...(filters.salesUserIds?.length
        ? { proformaInvoice: { salesUserId: { in: filters.salesUserIds } } }
        : {}),
      ...(fromDate || toDate
        ? {
            dispatchDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { customerName: true } },
      proformaInvoice: {
        select: {
          piNo: true,
          salesUser: { select: { name: true } },
        },
      },
      lines: {
        include: {
          product: { select: { displayName: true } },
        },
      },
    },
    orderBy: [{ dispatchDate: "asc" }, { dcNo: "asc" }],
  });

  const rows: Array<{
    srNo: number;
    date: string;
    seName: string;
    companyName: string;
    productName: string;
    qty: number;
    piNumber: string;
    dcNumber: string;
  }> = [];

  let srNo = 0;
  for (const dispatch of dispatches) {
    for (const line of dispatch.lines) {
      srNo += 1;
      rows.push({
        srNo,
        date: dispatch.dispatchDate.toISOString().slice(0, 10),
        seName: dispatch.proformaInvoice.salesUser.name,
        companyName: dispatch.customer.customerName,
        productName: line.product.displayName,
        qty: decimalToNumber(line.qty),
        piNumber: dispatch.proformaInvoice.piNo,
        dcNumber: dispatch.dcNo,
      });
    }
  }

  return rows;
}

export async function getSalesPerformanceReport(
  prisma: PrismaClient,
  companyId: string,
  filters: SalesPerformanceReportFilters,
) {
  return buildTeamKpiSummaries(
    prisma,
    companyId,
    {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      customerType: filters.customerType,
    },
    filters.salesUserId,
  );
}

export async function getSalesFunnelReport(
  prisma: PrismaClient,
  companyId: string,
  filters: SalesFunnelReportFilters,
) {
  const metricFilters: SalesMetricFilters = {
    companyId,
    salesUserId: filters.salesUserId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    customerType: filters.customerType,
  };
  const funnel = await getSalesFunnel(prisma, metricFilters);

  return [
    {
      stage: "Quotation",
      value: funnel.quotationValue,
      conversionPercent: null as number | null,
    },
    {
      stage: "PI",
      value: funnel.piValue,
      conversionPercent: funnel.conversion.quotationToPi,
    },
    {
      stage: "Collection",
      value: funnel.collectionValue,
      conversionPercent: funnel.conversion.piToCollection,
    },
    {
      stage: "Dispatch",
      value: funnel.dispatchedValue,
      conversionPercent: funnel.conversion.collectionToDispatch,
    },
  ];
}

export async function getCollectionReport(
  prisma: PrismaClient,
  companyId: string,
  filters: CollectionReportFilters,
) {
  const metricFilters: SalesMetricFilters = {
    companyId,
    salesUserId: filters.salesUserId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };

  const paymentWhere = buildPaymentWhere(metricFilters);

  const payments = await prisma.payment.findMany({
    where: {
      ...paymentWhere,
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
    },
    include: {
      proformaInvoice: {
        select: {
          piNo: true,
          customer: { select: { customerName: true } },
          salesUser: { select: { name: true } },
        },
      },
    },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });

  const collectionRows = payments.map((payment) => ({
    recordType: "Collection" as const,
    date: payment.paymentDate.toISOString().slice(0, 10),
    piNo: payment.proformaInvoice.piNo,
    customerName: payment.proformaInvoice.customer.customerName,
    executiveName: payment.proformaInvoice.salesUser.name,
    collectionAmount: decimalToNumber(payment.amount),
    outstanding: null as number | null,
    ageingDays: null as number | null,
    ageingBucket: null as string | null,
  }));

  const outstandingRows = (await getPaymentFollowupReport(prisma, companyId, filters)).map(
    (row) => ({
      recordType: "Outstanding" as const,
      date: row.piDate,
      piNo: row.piNo,
      customerName: row.customerName,
      executiveName: row.salesExecutive,
      collectionAmount: null as number | null,
      outstanding: row.outstanding,
      ageingDays: row.ageingDays,
      ageingBucket: row.ageingBucket,
    }),
  );

  return [...collectionRows, ...outstandingRows];
}

export async function getExecutivePerformanceReport(
  prisma: PrismaClient,
  companyId: string,
  filters: ExecutivePerformanceReportFilters,
) {
  const salesUsers = await listSalesExecutivesForCompany(
    prisma,
    companyId,
    filters.salesUserId,
  );
  if (salesUsers.length === 0) return [];

  const asOf = filters.toDate ? parseReportDate(filters.toDate) : new Date();
  const { year, month } = getBusinessMonthRange(asOf);
  const masteryConfig = await loadMasteryEngineConfig(prisma, companyId);

  const rows = await Promise.all(
    salesUsers.map(async (user) => {
      const [kpi, target, masteryProgress] = await Promise.all([
        buildExecutiveKpiSummary(prisma, companyId, user, {
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          customerType: filters.customerType,
        }),
        getModuleTargetProgress(prisma, companyId, user.id, asOf),
        prisma.executiveModuleMasteryProgress.findUnique({
          where: {
            companyId_executiveId_year_month: {
              companyId,
              executiveId: user.id,
              year,
              month,
            },
          },
        }),
      ]);

      const modulesDispatched = masteryProgress
        ? decimalToNumber(masteryProgress.modulesDispatched)
        : 0;
      const mastery = calculateModuleMasteryLevel(modulesDispatched, masteryConfig);

      return {
        executiveId: user.id,
        executiveName: user.name,
        executiveEmail: user.email,
        targetModules: target.targetModules,
        achievedModules: target.achievedModules,
        targetProgressPercent: target.progressPercent,
        masteryLevel: mastery.currentLevelName,
        masteryLevelNumber: mastery.currentLevelNumber,
        modulesDispatchedThisMonth: modulesDispatched,
        quotationValue: kpi.quotationValue.counted,
        quotationValueActual: kpi.quotationValue.actual,
        piValue: kpi.piValue.counted,
        piValueActual: kpi.piValue.actual,
        collectionValue: kpi.collectionValue.counted,
        collectionValueActual: kpi.collectionValue.actual,
        dispatchedValue: kpi.dispatchedValue.counted,
        dispatchedValueActual: kpi.dispatchedValue.actual,
        moduleUnits: kpi.moduleUnits.counted,
        moduleUnitsActual: kpi.moduleUnits.actual,
        newCustomers: kpi.newCustomers.counted,
        newCustomersActual: kpi.newCustomers.actual,
      };
    }),
  );

  return rows.filter(
    (row) =>
      row.quotationValueActual > 0 ||
      row.piValueActual > 0 ||
      row.collectionValueActual > 0 ||
      row.dispatchedValueActual > 0 ||
      row.moduleUnitsActual > 0 ||
      row.newCustomersActual > 0 ||
      row.achievedModules > 0 ||
      Boolean(filters.salesUserId),
  );
}
