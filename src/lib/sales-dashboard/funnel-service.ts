import type { PrismaClient } from "@prisma/client";
import {
  buildCollectionValueAggregate,
  buildDispatchedValueAggregate,
  buildPiValueAggregate,
  buildQuotationValueAggregate,
  type KpiStripDto,
  type SalesMetricFilters,
} from "@/lib/report-builders";
import type { SalesFunnelDto } from "@/lib/sales-dashboard/dashboard-types";

function conversionRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function funnelFromValues(values: {
  quotationValue: number;
  piValue: number;
  collectionValue: number;
  dispatchedValue: number;
}): SalesFunnelDto {
  return {
    quotationValue: values.quotationValue,
    piValue: values.piValue,
    collectionValue: values.collectionValue,
    dispatchedValue: values.dispatchedValue,
    conversion: {
      quotationToPi: conversionRate(values.piValue, values.quotationValue),
      piToCollection: conversionRate(values.collectionValue, values.piValue),
      collectionToDispatch: conversionRate(values.dispatchedValue, values.collectionValue),
    },
  };
}

/** Derive funnel from KPI strip actuals (no extra DB round-trips). */
export function funnelFromKpiStrip(kpiStrip: KpiStripDto): SalesFunnelDto {
  return funnelFromValues({
    quotationValue: kpiStrip.quotationValue.actualCurrent,
    piValue: kpiStrip.piValue.actualCurrent,
    collectionValue: kpiStrip.collectionValue.actualCurrent,
    dispatchedValue: kpiStrip.dispatchedValue.actualCurrent,
  });
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

  return funnelFromValues({
    quotationValue: quotationValue.actual,
    piValue: piValue.actual,
    collectionValue: collectionValue.actual,
    dispatchedValue: dispatchedValue.actual,
  });
}
