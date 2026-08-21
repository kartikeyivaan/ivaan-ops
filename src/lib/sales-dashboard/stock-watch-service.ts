import {
  ProformaInvoiceStatus,
  QuotationStatus,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import { calculateFreeQty } from "@/lib/reports";
import {
  toCompanyIdList,
  type CompanyIdFilter,
} from "@/lib/report-builders";
import type {
  SalesStockWatchDto,
  SalesStockWatchItemDto,
} from "@/lib/sales-dashboard/dashboard-types";

const MAX_PRODUCTS = 10;

function resolveStockStatus(
  openRequirement: number,
  freeQty: number,
): SalesStockWatchItemDto["status"] {
  if (openRequirement <= 0) return "AVAILABLE";
  if (freeQty >= openRequirement) return "AVAILABLE";
  if (freeQty <= 0) return "SHORT";
  if (freeQty < openRequirement * 0.25) return "CONFLICT";
  return "LOW";
}

export async function getSalesStockWatch(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
  salesUserId?: string,
): Promise<SalesStockWatchDto> {
  const [openQuotations, openPis] = await Promise.all([
    prisma.quotation.findMany({
      where: {
        companyId,
        status: QuotationStatus.SENT,
        ...(salesUserId ? { salesUserId } : {}),
      },
      include: {
        items: {
          select: {
            productId: true,
            qty: true,
            product: {
              select: { displayName: true, brand: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.proformaInvoice.findMany({
      where: {
        companyId,
        ...(salesUserId ? { salesUserId } : {}),
        status: {
          in: [
            ProformaInvoiceStatus.ISSUED,
            ProformaInvoiceStatus.PENDING_BOOKING,
            ProformaInvoiceStatus.BOOKED,
            ProformaInvoiceStatus.PARTIALLY_DISPATCHED,
          ],
        },
      },
      include: {
        warehouse: { select: { id: true, name: true, companyId: true } },
        items: {
          select: {
            productId: true,
            qty: true,
            dispatchedQty: true,
            product: {
              select: { displayName: true, brand: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ]);

  const requirementByProduct = new Map<
    string,
    {
      productName: string;
      brandName: string;
      openRequirement: number;
      warehouseId: string | null;
      warehouseName: string | null;
      stockCompanyId: string | null;
    }
  >();

  for (const quotation of openQuotations) {
    for (const item of quotation.items) {
      const existing = requirementByProduct.get(item.productId) ?? {
        productName: item.product.displayName,
        brandName: item.product.brand.name,
        openRequirement: 0,
        warehouseId: null,
        warehouseName: null,
        stockCompanyId: quotation.companyId,
      };
      existing.openRequirement += decimalToNumber(item.qty);
      if (!existing.stockCompanyId) existing.stockCompanyId = quotation.companyId;
      requirementByProduct.set(item.productId, existing);
    }
  }

  for (const pi of openPis) {
    for (const item of pi.items) {
      const remaining = Math.max(
        0,
        decimalToNumber(item.qty) - decimalToNumber(item.dispatchedQty),
      );
      if (remaining <= 0) continue;
      const existing = requirementByProduct.get(item.productId) ?? {
        productName: item.product.displayName,
        brandName: item.product.brand.name,
        openRequirement: 0,
        warehouseId: pi.warehouseId,
        warehouseName: pi.warehouse?.name ?? null,
        stockCompanyId: pi.warehouse?.companyId ?? pi.companyId,
      };
      existing.openRequirement += remaining;
      if (pi.warehouseId) {
        existing.warehouseId = pi.warehouseId;
        existing.warehouseName = pi.warehouse?.name ?? null;
        existing.stockCompanyId = pi.warehouse?.companyId ?? pi.companyId;
      }
      requirementByProduct.set(item.productId, existing);
    }
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, companyId: true },
    orderBy: { name: "asc" },
  });
  const defaultWarehouse = warehouses[0] ?? null;
  const fallbackCompanyId = toCompanyIdList(companyId)[0]!;

  const items: SalesStockWatchItemDto[] = [];

  for (const [productId, meta] of requirementByProduct) {
    const warehouseId = meta.warehouseId ?? defaultWarehouse?.id;
    if (!warehouseId) continue;
    const stockCompanyId =
      meta.stockCompanyId ??
      defaultWarehouse?.companyId ??
      fallbackCompanyId;

    const stock = await getWarehouseStockForProduct(
      prisma,
      stockCompanyId,
      productId,
      warehouseId,
    );
    const freeQty = calculateFreeQty(stock.availableStock, stock.bookedStock);
    const status = resolveStockStatus(meta.openRequirement, freeQty);

    items.push({
      productId,
      productName: meta.productName,
      brandName: meta.brandName,
      openRequirement: meta.openRequirement,
      available: stock.availableStock,
      freeQty,
      status,
      warehouseId,
      warehouseName: meta.warehouseName ?? defaultWarehouse?.name ?? null,
    });
  }

  items.sort((a, b) => {
    const severity = (status: SalesStockWatchItemDto["status"]) =>
      status === "SHORT" ? 0 : status === "CONFLICT" ? 1 : status === "LOW" ? 2 : 3;
    const diff = severity(a.status) - severity(b.status);
    if (diff !== 0) return diff;
    return b.openRequirement - a.openRequirement;
  });

  return { items: items.slice(0, MAX_PRODUCTS) };
}

export async function getStockConflicts(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
): Promise<
  Array<{
    productId: string;
    productName: string;
    available: number;
    required: number;
    shortBy: number;
  }>
> {
  const watch = await getSalesStockWatch(prisma, companyId);
  return watch.items
    .filter((item) => item.status === "SHORT" || item.status === "CONFLICT")
    .map((item) => ({
      productId: item.productId,
      productName: item.productName,
      available: item.available,
      required: item.openRequirement,
      shortBy: Math.max(0, item.openRequirement - item.freeQty),
    }));
}
