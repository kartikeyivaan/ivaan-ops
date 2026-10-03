import { PricingType, type PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { loadApprovalProductInfoMap } from "@/lib/approval-product-info";
import {
  formatQuotationApprovalRate,
  formatShortProductNameForApproval,
} from "@/lib/quotation-approval-reason";

export function formatProductRateChangeLineReason(input: {
  shortName: string;
  pricingType: Parameters<typeof formatQuotationApprovalRate>[1];
  previousStandardPrice: number;
  newStandardPrice: number;
  previousMinimumPrice: number;
  newMinimumPrice: number;
}): string {
  const stdPrev = formatQuotationApprovalRate(
    input.previousStandardPrice,
    input.pricingType,
  );
  const stdNew = formatQuotationApprovalRate(input.newStandardPrice, input.pricingType);
  const minPrev = formatQuotationApprovalRate(
    input.previousMinimumPrice,
    input.pricingType,
  );
  const minNew = formatQuotationApprovalRate(input.newMinimumPrice, input.pricingType);
  return `${input.shortName} - Std ${stdPrev} to ${stdNew}, Min ${minPrev} to ${minNew}`;
}

export function joinProductRateChangeReasons(
  lines: string[],
  signOffSuffix?: string,
): string {
  if (lines.length === 0) {
    return signOffSuffix ?? "Product rate change";
  }
  const body = lines.join("; ");
  return signOffSuffix ? `${body}; ${signOffSuffix}` : body;
}

export async function buildProductRateChangeApprovalReasonMap(
  prisma: PrismaClient,
  batchIds: string[],
  options?: { signOffCounts?: Map<string, number> },
): Promise<Map<string, string>> {
  if (batchIds.length === 0) return new Map();

  const batches = await prisma.productRateChangeBatch.findMany({
    where: { id: { in: batchIds } },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          productId: true,
          previousStandardPrice: true,
          previousMinimumPrice: true,
          newStandardPrice: true,
          newMinimumPrice: true,
        },
      },
    },
  });

  const productIds = batches.flatMap((batch) => batch.lines.map((line) => line.productId));
  const productMap = await loadApprovalProductInfoMap(prisma, productIds);

  const result = new Map<string, string>();
  for (const batch of batches) {
    const lineReasons = batch.lines.map((line) => {
      const product = productMap.get(line.productId);
      const shortName = product
        ? formatShortProductNameForApproval(product)
        : "Product";
      const pricingType = product?.pricingType ?? PricingType.UNIT;
      return formatProductRateChangeLineReason({
        shortName,
        pricingType,
        previousStandardPrice: decimalToNumber(line.previousStandardPrice),
        newStandardPrice: decimalToNumber(line.newStandardPrice),
        previousMinimumPrice: decimalToNumber(line.previousMinimumPrice),
        newMinimumPrice: decimalToNumber(line.newMinimumPrice),
      });
    });
    const signOffCount = options?.signOffCounts?.get(batch.id);
    const suffix =
      signOffCount === undefined
        ? undefined
        : `Sign-off ${signOffCount}/2`;
    result.set(batch.id, joinProductRateChangeReasons(lineReasons, suffix));
  }

  return result;
}
