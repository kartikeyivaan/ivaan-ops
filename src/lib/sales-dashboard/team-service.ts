import { ProformaInvoiceStatus, type PrismaClient } from "@prisma/client";
import { getBusinessToday, parseBusinessDate } from "@/lib/business-dates";
import { buildTeamKpiSummaries } from "@/lib/report-builders";
import type { DashboardPeriod } from "@/lib/business-dates";
import type { TeamScoreboardDto } from "@/lib/sales-dashboard/dashboard-types";

export async function getTeamScoreboard(
  prisma: PrismaClient,
  companyId: string,
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

  rows.sort((a, b) => b.moduleUnits - a.moduleUnits || b.dispatchedValue - a.dispatchedValue);

  return {
    period,
    fromDate,
    toDate,
    rows,
  };
}

export async function getTeamKpiStripTotals(
  prisma: PrismaClient,
  companyId: string,
  fromDate: string,
  toDate: string,
) {
  const rows = await buildTeamKpiSummaries(prisma, companyId, { fromDate, toDate });
  return rows.reduce(
    (totals, row) => ({
      quotationValue: totals.quotationValue + row.quotationValue,
      piValue: totals.piValue + row.piValue,
      collectionValue: totals.collectionValue + row.collectionValue,
      dispatchedValue: totals.dispatchedValue + row.dispatchedValue,
      moduleUnits: totals.moduleUnits + row.moduleUnits,
    }),
    {
      quotationValue: 0,
      piValue: 0,
      collectionValue: 0,
      dispatchedValue: 0,
      moduleUnits: 0,
    },
  );
}

export async function getBookedNotDispatchedRisks(
  prisma: PrismaClient,
  companyId: string,
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
