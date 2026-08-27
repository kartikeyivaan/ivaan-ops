import type { DispatchLineCostSource, Prisma } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { roundMoney } from "@/lib/quotations";

export type ProductPriceRow = {
  productId: string;
  landingCost: Prisma.Decimal | number | string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function unitCostFromLot(lot: {
  unitPurchaseRate: Prisma.Decimal | number | string;
  totalPurchaseCost: Prisma.Decimal | number | string;
  quantity: Prisma.Decimal | number | string;
}): number {
  const unitRate = decimalToNumber(lot.unitPurchaseRate);
  if (unitRate > 0) return unitRate;
  const qty = decimalToNumber(lot.quantity);
  const total = decimalToNumber(lot.totalPurchaseCost);
  if (qty > 0 && total > 0) return total / qty;
  return 0;
}

export function resolveLandingCost(
  productId: string,
  asOf: Date,
  prices: ReadonlyArray<ProductPriceRow>,
): number {
  const asOfDay = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()));
  const nextDay = new Date(asOfDay);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const match = prices
    .filter((price) => price.productId === productId)
    .find(
      (price) =>
        price.effectiveFrom < nextDay &&
        (price.effectiveTo === null || price.effectiveTo >= asOfDay),
    );

  return match ? decimalToNumber(match.landingCost) : 0;
}

export type DispatchProfitLineInput = {
  productId: string;
  qty: Prisma.Decimal | number | string;
  serialTracking: boolean;
  serialLots: Array<{
    unitPurchaseRate: Prisma.Decimal | number | string;
    totalPurchaseCost: Prisma.Decimal | number | string;
    quantity: Prisma.Decimal | number | string;
  }>;
};

export function resolveLineCogsExGst(
  line: DispatchProfitLineInput,
  asOf: Date,
  prices: ReadonlyArray<ProductPriceRow>,
): { cogsExGst: number; costSource: DispatchLineCostSource } {
  const qty = decimalToNumber(line.qty);
  const landingUnit = resolveLandingCost(line.productId, asOf, prices);
  const landingTotal = roundMoney(landingUnit * qty);

  if (line.serialTracking && line.serialLots.length > 0) {
    const serialCosts = line.serialLots.map((lot) => unitCostFromLot(lot));
    const serialTotal = roundMoney(serialCosts.reduce((sum, cost) => sum + cost, 0));
    const hasSerialCost = serialTotal > 0;
    const hasLanding = landingTotal > 0;

    if (hasSerialCost && hasLanding && Math.abs(serialTotal - landingTotal) > 0.01) {
      return { cogsExGst: serialTotal, costSource: "MIXED" };
    }
    if (hasSerialCost) {
      return { cogsExGst: serialTotal, costSource: "SERIAL_LOT" };
    }
    if (hasLanding) {
      return { cogsExGst: landingTotal, costSource: "LANDING_COST" };
    }
    return { cogsExGst: 0, costSource: "UNKNOWN" };
  }

  if (landingTotal > 0) {
    return { cogsExGst: landingTotal, costSource: "LANDING_COST" };
  }

  return { cogsExGst: 0, costSource: "UNKNOWN" };
}

export function calculateDispatchLineProfitBundle(revenueExGst: number, cogsExGst: number) {
  const profitExGst = roundMoney(revenueExGst - cogsExGst);
  const marginPercent =
    revenueExGst > 0 ? roundMoney((profitExGst / revenueExGst) * 100) : 0;

  return {
    revenueExGst: roundMoney(revenueExGst),
    cogsExGst: roundMoney(cogsExGst),
    profitExGst,
    marginPercent,
  };
}

export function formatCostSource(source: DispatchLineCostSource | null | undefined): string {
  switch (source) {
    case "SERIAL_LOT":
      return "Serial lot";
    case "LANDING_COST":
      return "Landing cost";
    case "MIXED":
      return "Mixed";
    case "UNKNOWN":
      return "Unknown";
    default:
      return "—";
  }
}
