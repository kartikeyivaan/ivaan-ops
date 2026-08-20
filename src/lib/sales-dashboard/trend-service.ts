import { DispatchStatus, type PrismaClient } from "@prisma/client";
import { parseBusinessDate, endOfBusinessDay } from "@/lib/business-dates";
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
      select: { piDate: true, totalValue: true },
    });
    const byDate = new Map<string, number>();
    for (const row of rows) {
      const key = row.piDate.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) ?? 0) + decimalToNumber(row.totalValue));
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
      select: { paymentDate: true, amount: true },
    });
    const byDate = new Map<string, number>();
    for (const row of rows) {
      const key = row.paymentDate.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) ?? 0) + decimalToNumber(row.amount));
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
      lines: {
        select: {
          qty: true,
          proformaInvoiceItem: { select: { rate: true } },
          product: { select: { category: { select: { name: true } } } },
        },
      },
    },
  });

  const byDate = new Map<string, number>();
  for (const dispatch of dispatches) {
    const key = dispatch.dispatchDate.toISOString().slice(0, 10);
    const value =
      metric === "dispatch"
        ? sumDispatchedValueFromLines([dispatch])
        : sumDispatchedUnitsFromLines([dispatch]).modules;
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
  if (metric === "collection") return buildCollectionValueAggregate(prisma, filters);
  if (metric === "pi") return buildPiValueAggregate(prisma, filters);
  const trend = await getPerformanceTrend(prisma, filters, metric);
  return trend.points.reduce((sum, point) => sum + point.value, 0);
}
