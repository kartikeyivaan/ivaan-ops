import { DispatchStatus, type PrismaClient } from "@prisma/client";
import { parseBusinessDate, endOfBusinessDay } from "@/lib/business-dates";
import { loadKitBomMapForDispatches } from "@/lib/dispatch-value";
import { applyIncentiveCredit } from "@/lib/incentive-credit";
import { decimalToNumber } from "@/lib/inventory";
import {
  buildCollectionValueAggregate,
  buildPiValueAggregate,
  sumDispatchedUnitsFromLines,
  sumDispatchedValueFromLines,
  type SalesMetricFilters,
} from "@/lib/report-builders";
import type { PerformanceTrendDto } from "@/lib/sales-dashboard/dashboard-types";

export type TrendMetric = PerformanceTrendDto["metric"];

function listDatesInclusive(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    dates.push(cursor);
    const next = parseBusinessDate(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
    if (dates.length > 120) break;
  }
  return dates;
}

export async function getPerformanceTrend(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
  metric: TrendMetric,
): Promise<PerformanceTrendDto> {
  if (!filters.fromDate || !filters.toDate) {
    return { metric, points: [] };
  }

  const dates = listDatesInclusive(filters.fromDate, filters.toDate);
  const points: PerformanceTrendDto["points"] = [];

  if (metric === "pi") {
    const rows = await prisma.proformaInvoice.findMany({
      where: {
        companyId: filters.companyId,
        ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
        piDate: {
          gte: parseBusinessDate(filters.fromDate),
          lte: endOfBusinessDay(filters.toDate),
        },
      },
      select: {
        piDate: true,
        totalValue: true,
        customer: { select: { incentiveCreditPercent: true } },
      },
    });
    const byDate = new Map<string, number>();
    for (const row of rows) {
      const key = row.piDate.toISOString().slice(0, 10);
      const credited = applyIncentiveCredit(
        decimalToNumber(row.totalValue),
        row.customer.incentiveCreditPercent,
      ).counted;
      byDate.set(key, (byDate.get(key) ?? 0) + credited);
    }
    for (const date of dates) {
      points.push({ date, value: Math.round((byDate.get(date) ?? 0) * 100) / 100 });
    }
    return { metric, points };
  }

  if (metric === "collection") {
    const rows = await prisma.payment.findMany({
      where: {
        proformaInvoice: {
          companyId: filters.companyId,
          ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
        },
        paymentDate: {
          gte: parseBusinessDate(filters.fromDate),
          lte: endOfBusinessDay(filters.toDate),
        },
      },
      select: {
        paymentDate: true,
        amount: true,
        customer: { select: { incentiveCreditPercent: true } },
      },
    });
    const byDate = new Map<string, number>();
    for (const row of rows) {
      const key = row.paymentDate.toISOString().slice(0, 10);
      const credited = applyIncentiveCredit(
        decimalToNumber(row.amount),
        row.customer.incentiveCreditPercent,
      ).counted;
      byDate.set(key, (byDate.get(key) ?? 0) + credited);
    }
    for (const date of dates) {
      points.push({ date, value: Math.round((byDate.get(date) ?? 0) * 100) / 100 });
    }
    return { metric, points };
  }

  const dispatches = await prisma.dispatch.findMany({
    where: {
      companyId: filters.companyId,
      status: DispatchStatus.DISPATCHED,
      ...(filters.salesUserId
        ? { proformaInvoice: { salesUserId: filters.salesUserId } }
        : {}),
      dispatchDate: {
        gte: parseBusinessDate(filters.fromDate),
        lte: endOfBusinessDay(filters.toDate),
      },
    },
    select: {
      dispatchDate: true,
      customer: { select: { incentiveCreditPercent: true } },
      lines: {
        select: {
          productId: true,
          qty: true,
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
          product: {
            select: {
              pricingType: true,
              capacity: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const kitBomMap = await loadKitBomMapForDispatches(prisma, dispatches);
  const byDate = new Map<string, number>();
  for (const dispatch of dispatches) {
    const key = dispatch.dispatchDate.toISOString().slice(0, 10);
    const value =
      metric === "dispatch"
        ? sumDispatchedValueFromLines([dispatch], kitBomMap).counted
        : sumDispatchedUnitsFromLines([dispatch]).modules.counted;
    byDate.set(key, (byDate.get(key) ?? 0) + value);
  }

  for (const date of dates) {
    points.push({ date, value: Math.round((byDate.get(date) ?? 0) * 100) / 100 });
  }

  return { metric, points };
}

export async function getDefaultTrendMetricValue(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
  metric: TrendMetric,
): Promise<number> {
  if (metric === "collection") {
    return (await buildCollectionValueAggregate(prisma, filters)).counted;
  }
  if (metric === "pi") {
    return (await buildPiValueAggregate(prisma, filters)).counted;
  }
  const trend = await getPerformanceTrend(prisma, filters, metric);
  return trend.points.reduce((sum, point) => sum + point.value, 0);
}
