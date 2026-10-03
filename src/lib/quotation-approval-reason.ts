import {
  CapacityUnit,
  ItemApprovalStatus,
  PricingType,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { formatCapacityUnit, isKitCategory } from "@/lib/products";
import { isProductPriceEffectiveOn, toDateOnly } from "@/lib/quotations";

const MODULE_CATEGORY = "Modules";
const INVERTER_CATEGORY = "Inverters";

export type QuotationApprovalProductInfo = {
  displayName: string;
  pricingType: PricingType;
  capacity: number;
  capacityUnit: CapacityUnit;
  categoryName: string;
  brandName: string;
  technologyName: string | null;
};

function formatCompactCapacity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

function moduleCapacityWp(capacity: number, capacityUnit: CapacityUnit): string {
  const wp =
    capacityUnit === CapacityUnit.WP
      ? capacity
      : capacityUnit === CapacityUnit.KW
        ? capacity * 1000
        : capacity;
  return `${formatCompactCapacity(wp)}Wp`;
}

export function formatShortProductNameForApproval(
  product: QuotationApprovalProductInfo,
): string {
  if (isKitCategory(product.categoryName) || product.categoryName === "Other") {
    return product.displayName;
  }
  if (product.categoryName === MODULE_CATEGORY) {
    const technology = product.technologyName?.trim() || "Module";
    return `${technology} ${moduleCapacityWp(product.capacity, product.capacityUnit)}`;
  }
  if (product.categoryName === INVERTER_CATEGORY) {
    return `${product.brandName} - ${formatCompactCapacity(product.capacity)} ${formatCapacityUnit(product.capacityUnit)}`;
  }
  return product.displayName;
}

export function formatQuotationApprovalRate(
  rate: number,
  pricingType: PricingType,
): string {
  if (pricingType === PricingType.WP) {
    return rate.toFixed(2);
  }
  return String(Math.round(rate));
}

export function formatQuotationPriceLineReason(input: {
  product: QuotationApprovalProductInfo;
  givenRate: number;
  minimumRate: number;
}): string {
  const name = formatShortProductNameForApproval(input.product);
  const given = formatQuotationApprovalRate(input.givenRate, input.product.pricingType);
  const minimum = formatQuotationApprovalRate(
    input.minimumRate,
    input.product.pricingType,
  );
  return `${name} - Given ${given} Min ${minimum}`;
}

function priceLookupKey(productId: string, asOf: Date): string {
  return `${productId}:${toDateOnly(asOf).toISOString().slice(0, 10)}`;
}

async function loadMinimumPriceMap(
  prisma: PrismaClient,
  pairs: Array<{ productId: string; asOf: Date }>,
): Promise<Map<string, number>> {
  const uniqueProductIds = [...new Set(pairs.map((pair) => pair.productId))];
  if (uniqueProductIds.length === 0) return new Map();

  const prices = await prisma.productPrice.findMany({
    where: { productId: { in: uniqueProductIds } },
    orderBy: [{ productId: "asc" }, { effectiveFrom: "desc" }],
  });

  const byProduct = new Map<string, typeof prices>();
  for (const price of prices) {
    const list = byProduct.get(price.productId) ?? [];
    list.push(price);
    byProduct.set(price.productId, list);
  }

  const result = new Map<string, number>();
  for (const pair of pairs) {
    const key = priceLookupKey(pair.productId, pair.asOf);
    if (result.has(key)) continue;
    const productPrices = byProduct.get(pair.productId) ?? [];
    const match = productPrices.find((price) =>
      isProductPriceEffectiveOn(price, pair.asOf),
    );
    if (match) {
      result.set(key, decimalToNumber(match.minimumPrice));
    }
  }
  return result;
}

type QuotationItemRow = {
  rate: { toNumber?: () => number } | number | string;
  approvalStatus: ItemApprovalStatus;
  product: QuotationApprovalProductInfo;
};

function lineRate(rate: QuotationItemRow["rate"]): number {
  if (typeof rate === "number") return rate;
  if (typeof rate === "string") return Number(rate);
  if (rate && typeof rate === "object" && "toNumber" in rate && rate.toNumber) {
    return rate.toNumber();
  }
  return Number(rate);
}

export function joinQuotationPriceLineReasons(lines: string[]): string {
  if (lines.length === 0) return "Below-minimum pricing";
  return lines.join("; ");
}

export async function buildQuotationPriceApprovalReasonMap(
  prisma: PrismaClient,
  quotationIds: string[],
  filter: "pending" | "below_minimum",
): Promise<Map<string, string>> {
  if (quotationIds.length === 0) return new Map();

  const quotations = await prisma.quotation.findMany({
    where: { id: { in: quotationIds } },
    select: {
      id: true,
      quotationDate: true,
      items: {
        select: {
          rate: true,
          approvalStatus: true,
          productId: true,
          product: {
            select: {
              displayName: true,
              pricingType: true,
              capacity: true,
              capacityUnit: true,
              category: { select: { name: true } },
              brand: { select: { name: true } },
              technology: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const pricePairs: Array<{ productId: string; asOf: Date }> = [];
  for (const quotation of quotations) {
    for (const item of quotation.items) {
      pricePairs.push({ productId: item.productId, asOf: quotation.quotationDate });
    }
  }
  const minimumByKey = await loadMinimumPriceMap(prisma, pricePairs);

  const result = new Map<string, string>();
  for (const quotation of quotations) {
    const lineReasons: string[] = [];
    for (const item of quotation.items) {
      if (filter === "pending" && item.approvalStatus !== ItemApprovalStatus.PENDING) {
        continue;
      }
      const givenRate = lineRate(item.rate);
      const minimumRate = minimumByKey.get(
        priceLookupKey(item.productId, quotation.quotationDate),
      );
      if (minimumRate === undefined) continue;
      if (filter === "below_minimum" && givenRate >= minimumRate) continue;

      const product: QuotationApprovalProductInfo = {
        displayName: item.product.displayName,
        pricingType: item.product.pricingType,
        capacity: decimalToNumber(item.product.capacity),
        capacityUnit: item.product.capacityUnit,
        categoryName: item.product.category.name,
        brandName: item.product.brand.name,
        technologyName: item.product.technology?.name ?? null,
      };

      lineReasons.push(
        formatQuotationPriceLineReason({
          product,
          givenRate,
          minimumRate,
        }),
      );
    }
    result.set(quotation.id, joinQuotationPriceLineReasons(lineReasons));
  }

  return result;
}
