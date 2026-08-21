import { ProformaInvoiceStatus, type PrismaClient } from "@prisma/client";
import { getBusinessToday, parseBusinessDate } from "@/lib/business-dates";
import {
  buildTeamKpiSummaries,
  type CompanyIdFilter,
} from "@/lib/report-builders";
import type { DashboardPeriod } from "@/lib/business-dates";
import type { TeamScoreboardDto } from "@/lib/sales-dashboard/dashboard-types";

export async function getTeamScoreboard(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
  fromDate: string,
  toDate: string,
  period: DashboardPeriod,
  salesUserId?: string,
): Promise<TeamScoreboardDto> {
  const rows = await buildTeamKpiSummaries(
    prisma,
    companyId,
    { fromDate, toDate },
    salesUserId,
  );

  rows.sort(
    (a, b) =>
      b.moduleUnits.counted - a.moduleUnits.counted ||
      b.dispatchedValue.counted - a.dispatchedValue.counted,
  );

  return {
    period,
    fromDate,
    toDate,
    rows,
  };
}

export async function getTeamKpiStripTotals(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
  fromDate: string,
  toDate: string,
) {
  const rows = await buildTeamKpiSummaries(prisma, companyId, { fromDate, toDate });
  return rows.reduce(
    (totals, row) => ({
      quotationValue: {
        actual: totals.quotationValue.actual + row.quotationValue.actual,
        counted: totals.quotationValue.counted + row.quotationValue.counted,
      },
      piValue: {
        actual: totals.piValue.actual + row.piValue.actual,
        counted: totals.piValue.counted + row.piValue.counted,
      },
      collectionValue: {
        actual: totals.collectionValue.actual + row.collectionValue.actual,
        counted: totals.collectionValue.counted + row.collectionValue.counted,
      },
      dispatchedValue: {
        actual: totals.dispatchedValue.actual + row.dispatchedValue.actual,
        counted: totals.dispatchedValue.counted + row.dispatchedValue.counted,
      },
      moduleUnits: {
        actual: totals.moduleUnits.actual + row.moduleUnits.actual,
        counted: totals.moduleUnits.counted + row.moduleUnits.counted,
      },
    }),
    {
      quotationValue: { actual: 0, counted: 0 },
      piValue: { actual: 0, counted: 0 },
      collectionValue: { actual: 0, counted: 0 },
      dispatchedValue: { actual: 0, counted: 0 },
      moduleUnits: { actual: 0, counted: 0 },
    },
  );
}

export async function getBookedNotDispatchedRisks(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
  salesUserId?: string,
) {
  const today = getBusinessToday();
  const pis = await prisma.proformaInvoice.findMany({
    where: {
      companyId,
      ...(salesUserId ? { salesUserId } : {}),
      status: {
        in: [ProformaInvoiceStatus.BOOKED, ProformaInvoiceStatus.PARTIALLY_DISPATCHED],
      },
    },
    include: {
      customer: { select: { customerName: true } },
      salesUser: { select: { name: true } },
    },
    orderBy: { bookedAt: "asc" },
    take: 50,
  });

  return pis.map((pi) => {
    const anchor = pi.bookedAt ?? pi.piDate;
    const daysSinceBooking = Math.max(
      0,
      Math.floor(
        (parseBusinessDate(today).getTime() - anchor.getTime()) / 86_400_000,
      ),
    );
    return {
      piId: pi.id,
      piNo: pi.piNo,
      customerName: pi.customer.customerName,
      daysSinceBooking,
      executiveName: pi.salesUser.name,
      href: `/sales/proforma-invoices/${pi.id}`,
    };
  });
}
