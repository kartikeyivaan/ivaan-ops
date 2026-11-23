import { MonthlyAuditStatus, type PrismaClient } from "@prisma/client";

import { getWarehouseStockForProduct } from "@/lib/inventory-service";
import { monthlyAuditCompanyFilter } from "@/lib/monthly-serial-audit-scope";

/**
 * Manual section B lines (non-serialized products) for a monthly audit run.
 * Lets a user add a product that has no stock on record, for a chosen
 * company and warehouse, and enter its counted quantity.
 */

/** Products and warehouses a user can pick when adding a line. */
export async function getMonthlyAuditQtyOptions(prisma: PrismaClient) {
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, serialTracking: false },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true, company: monthlyAuditCompanyFilter },
      select: { id: true, name: true, company: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    products,
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      companyId: w.company.id,
      companyName: w.company.name,
    })),
  };
}

export async function addMonthlyAuditQtyLine(
  prisma: PrismaClient,
  input: { auditId: string; productId: string; warehouseId: string; auditQty: number },
) {
  if (!Number.isFinite(input.auditQty) || input.auditQty < 0) {
    throw new Error("INVALID_QUANTITY");
  }

  const audit = await prisma.inventoryMonthlyAudit.findUnique({
    where: { id: input.auditId },
    select: { status: true },
  });
  if (!audit) throw new Error("NOT_FOUND");
  if (audit.status !== MonthlyAuditStatus.OPEN) throw new Error("AUDIT_NOT_OPEN");

  const [product, warehouse] = await Promise.all([
    prisma.product.findUnique({
      where: { id: input.productId },
      select: { isActive: true, serialTracking: true },
    }),
    prisma.warehouse.findUnique({
      where: { id: input.warehouseId, company: monthlyAuditCompanyFilter },
      select: { id: true, isActive: true, companyId: true },
    }),
  ]);
  if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");
  if (product.serialTracking) throw new Error("SERIAL_PRODUCT_NOT_ALLOWED");
  if (!warehouse || !warehouse.isActive) throw new Error("WAREHOUSE_NOT_FOUND");

  const existing = await prisma.inventoryMonthlyAuditQtyLine.findFirst({
    where: {
      auditId: input.auditId,
      productId: input.productId,
      companyId: warehouse.companyId,
      warehouseId: warehouse.id,
    },
    select: { id: true },
  });
  if (existing) throw new Error("QTY_LINE_EXISTS");

  const stock = await getWarehouseStockForProduct(
    prisma,
    warehouse.companyId,
    input.productId,
    warehouse.id,
  );
  const recordQty = stock.availableStock;

  return prisma.inventoryMonthlyAuditQtyLine.create({
    data: {
      auditId: input.auditId,
      productId: input.productId,
      companyId: warehouse.companyId,
      warehouseId: warehouse.id,
      recordQty,
      auditQty: input.auditQty,
      varianceQty: input.auditQty - recordQty,
    },
  });
}
