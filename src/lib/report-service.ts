import {
  CustomerType,
  DispatchStatus,
  InventoryTransactionType,
  ProformaInvoiceStatus,
  QuotationStatus,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import { roundMoney } from "@/lib/quotations";
import {
  calculateAgeingDays,
  calculateFreeQty,
  calculateOutstanding,
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

export type DispatchReportFilters = ReportDateFilters & {
  salesUserId?: string;
  warehouseId?: string;
  customerId?: string;
  q?: string;
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
  const fromDate = parseReportDate(filters.fromDate);
  const toDate = endOfReportDay(filters.toDate);

  const salesUsers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      ...(filters.salesUserId ? { id: filters.salesUserId } : {}),
      roles: {
        some: {
          role: {
            name: { in: ["Sales Executive", "Sales Manager", "Super Admin"] },
          },
        },
      },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    salesUsers.map(async (user) => {
      const quotationWhere = {
        companyId,
        salesUserId: user.id,
        ...(fromDate || toDate
          ? {
              quotationDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        status: { not: QuotationStatus.DRAFT },
        ...(filters.customerType
          ? { customer: { customerType: filters.customerType } }
          : {}),
      };

      const piWhere = {
        companyId,
        salesUserId: user.id,
        ...(fromDate || toDate
          ? {
              piDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        ...(filters.customerType
          ? { customer: { customerType: filters.customerType } }
          : {}),
      };

      const [quotations, pis, payments, dispatches, newCustomers] = await Promise.all([
        prisma.quotation.findMany({
          where: quotationWhere,
          select: { totalValue: true },
        }),
        prisma.proformaInvoice.findMany({
          where: piWhere,
          select: { totalValue: true },
        }),
        prisma.payment.findMany({
          where: {
            proformaInvoice: {
              companyId,
              salesUserId: user.id,
              ...(filters.customerType
                ? { customer: { customerType: filters.customerType } }
                : {}),
            },
            ...(fromDate || toDate
              ? {
                  paymentDate: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                }
              : {}),
          },
          select: { amount: true },
        }),
        prisma.dispatch.findMany({
          where: {
            companyId,
            status: DispatchStatus.DISPATCHED,
            proformaInvoice: { salesUserId: user.id },
            ...(fromDate || toDate
              ? {
                  dispatchDate: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                }
              : {}),
            ...(filters.customerType
              ? { customer: { customerType: filters.customerType } }
              : {}),
          },
          include: {
            lines: {
              include: {
                proformaInvoiceItem: { select: { rate: true } },
              },
            },
          },
        }),
        prisma.customer.count({
          where: {
            companyId,
            assignedSalesUserId: user.id,
            ...(filters.customerType ? { customerType: filters.customerType } : {}),
            ...(fromDate || toDate
              ? {
                  createdAt: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                }
              : {}),
          },
        }),
      ]);

      const quotationValue = roundMoney(
        quotations.reduce((sum, row) => sum + decimalToNumber(row.totalValue), 0),
      );
      const piValue = roundMoney(
        pis.reduce((sum, row) => sum + decimalToNumber(row.totalValue), 0),
      );
      const collectionValue = roundMoney(
        payments.reduce((sum, row) => sum + decimalToNumber(row.amount), 0),
      );
      const dispatchedValue = roundMoney(
        dispatches.reduce((sum, dispatch) => {
          const lineTotal = dispatch.lines.reduce((lineSum, line) => {
            const rate = decimalToNumber(line.proformaInvoiceItem.rate);
            return lineSum + decimalToNumber(line.qty) * rate;
          }, 0);
          return sum + lineTotal;
        }, 0),
      );

      return {
        executiveId: user.id,
        executiveName: user.name,
        executiveEmail: user.email,
        quotationValue,
        piValue,
        collectionValue,
        dispatchedValue,
        newCustomers,
      };
    }),
  );

  return rows.filter(
    (row) =>
      row.quotationValue > 0 ||
      row.piValue > 0 ||
      row.collectionValue > 0 ||
      row.dispatchedValue > 0 ||
      row.newCustomers > 0 ||
      Boolean(filters.salesUserId),
  );
}

export async function getPaymentFollowupReport(
  prisma: PrismaClient,
  companyId: string,
  filters: PaymentFollowupFilters,
) {
  const pis = await prisma.proformaInvoice.findMany({
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
      ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
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
      const freeQty = calculateFreeQty(stock.availableStock, stock.bookedStock);

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
      customer: { select: { customerName: true } },
      warehouse: { select: { name: true } },
      proformaInvoice: {
        select: {
          piNo: true,
          salesUser: { select: { id: true, name: true } },
        },
      },
      lines: {
        include: {
          product: { select: { displayName: true } },
          proformaInvoiceItem: { select: { rate: true } },
        },
      },
    },
    orderBy: { dispatchDate: "desc" },
  });

  const rows: Array<{
    dcNo: string;
    piNo: string;
    customerName: string;
    executiveName: string;
    productName: string;
    qty: number;
    dispatchDate: string;
    vehicleNo: string;
    warehouseName: string;
    value: number;
  }> = [];

  for (const dispatch of dispatches) {
    for (const line of dispatch.lines) {
      const qty = decimalToNumber(line.qty);
      const rate = decimalToNumber(line.proformaInvoiceItem.rate);
      rows.push({
        dcNo: dispatch.dcNo,
        piNo: dispatch.proformaInvoice.piNo,
        customerName: dispatch.customer.customerName,
        executiveName: dispatch.proformaInvoice.salesUser.name,
        productName: line.product.displayName,
        qty,
        dispatchDate: dispatch.dispatchDate.toISOString().slice(0, 10),
        vehicleNo: dispatch.vehicleNo ?? "",
        warehouseName: dispatch.warehouse.name,
        value: roundMoney(qty * rate),
      });
    }
  }

  return rows;
}
