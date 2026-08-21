import type { PrismaClient } from "@prisma/client";
import {
  buildCollectionValueAggregate,
  buildDispatchedValueAggregate,
  buildPiValueAggregate,
  buildQuotationValueAggregate,
  type SalesMetricFilters,
} from "@/lib/report-builders";
import type { SalesFunnelDto } from "@/lib/sales-dashboard/dashboard-types";

function conversionRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getSalesFunnel(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<SalesFunnelDto> {
  const [quotationValue, piValue, collectionValue, dispatchedValue] = await Promise.all([
    buildQuotationValueAggregate(prisma, filters),
    buildPiValueAggregate(prisma, filters),
    buildCollectionValueAggregate(prisma, filters),
    buildDispatchedValueAggregate(prisma, filters),
  ]);

  return {
    quotationValue: quotationValue.actual,
    piValue: piValue.actual,
    collectionValue: collectionValue.actual,
    dispatchedValue: dispatchedValue.actual,
    conversion: {
      quotationToPi: conversionRate(piValue.actual, quotationValue.actual),
      piToCollection: conversionRate(collectionValue.actual, piValue.actual),
      collectionToDispatch: conversionRate(dispatchedValue.actual, collectionValue.actual),
    },
  };
}
