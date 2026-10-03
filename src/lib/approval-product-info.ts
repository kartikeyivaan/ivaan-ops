import type { PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import type { QuotationApprovalProductInfo } from "@/lib/quotation-approval-reason";

export const approvalProductSelect = {
  id: true,
  displayName: true,
  pricingType: true,
  capacity: true,
  capacityUnit: true,
  category: { select: { name: true } },
  brand: { select: { name: true } },
  technology: { select: { name: true } },
} as const;

type ProductRow = {
  id: string;
  displayName: string;
  pricingType: QuotationApprovalProductInfo["pricingType"];
  capacity: { toNumber(): number } | number | string;
  capacityUnit: QuotationApprovalProductInfo["capacityUnit"];
  category: { name: string };
  brand: { name: string };
  technology: { name: string } | null;
};

export function toApprovalProductInfo(product: ProductRow): QuotationApprovalProductInfo {
  return {
    displayName: product.displayName,
    pricingType: product.pricingType,
    capacity: decimalToNumber(product.capacity),
    capacityUnit: product.capacityUnit,
    categoryName: product.category.name,
    brandName: product.brand.name,
    technologyName: product.technology?.name ?? null,
  };
}

export async function loadApprovalProductInfoMap(
  prisma: PrismaClient,
  productIds: string[],
): Promise<Map<string, QuotationApprovalProductInfo>> {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) return new Map();

  const rows = await prisma.product.findMany({
    where: { id: { in: uniqueIds } },
    select: approvalProductSelect,
  });

  return new Map(rows.map((row) => [row.id, toApprovalProductInfo(row)]));
}
