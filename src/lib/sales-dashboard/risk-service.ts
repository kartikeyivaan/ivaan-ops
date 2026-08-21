import { ProformaInvoiceStatus, QuotationStatus, type PrismaClient } from "@prisma/client";
import {
  getBusinessToday,
  parseBusinessDate,
} from "@/lib/business-dates";
import { decimalToNumber } from "@/lib/inventory";
import { calculateAgeingDays, calculateOutstanding } from "@/lib/reports";
import type { CompanyIdFilter } from "@/lib/report-builders";
import type { PipelineRiskDto, WorkQueueItem } from "@/lib/sales-dashboard/dashboard-types";

const PIPELINE_LOOKBACK_DAYS = 30;
const STUCK_PI_ISSUED_DAYS = 14;
const STUCK_PI_DRAFT_DAYS = 7;
const EXPIRING_SOON_DAYS = 3;

function addDaysToDateStringLocal(value: string, days: number): string {
  const date = parseBusinessDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getPipelineRisks(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
  salesUserId?: string,
): Promise<PipelineRiskDto> {
  const today = getBusinessToday();
  const fromDate = addDaysToDateStringLocal(today, -PIPELINE_LOOKBACK_DAYS);
  const from = parseBusinessDate(fromDate);
  const soonEnd = addDaysToDateStringLocal(today, EXPIRING_SOON_DAYS);

  const [expiringRows, bookedRows, outstandingRows, stuckRows] = await Promise.all([
    prisma.quotation.findMany({
      where: {
        companyId,
        ...(salesUserId ? { salesUserId } : {}),
        OR: [
          {
            status: QuotationStatus.EXPIRED,
            expiryDate: { gte: from },
          },
          {
            status: QuotationStatus.SENT,
            expiryDate: {
              gte: from,
              lte: parseBusinessDate(soonEnd),
            },
          },
        ],
      },
      include: { customer: { select: { customerName: true } } },
      orderBy: { expiryDate: "asc" },
      take: 50,
    }),
    prisma.proformaInvoice.findMany({
      where: {
        companyId,
        ...(salesUserId ? { salesUserId } : {}),
        status: {
          in: [ProformaInvoiceStatus.BOOKED, ProformaInvoiceStatus.PARTIALLY_DISPATCHED],
        },
        OR: [
          { bookedAt: { gte: from } },
          { bookedAt: null, piDate: { gte: from } },
        ],
      },
      include: {
        customer: { select: { customerName: true } },
        salesUser: { select: { name: true } },
      },
      orderBy: { bookedAt: "asc" },
      take: 50,
    }),
    prisma.proformaInvoice.findMany({
      where: {
        companyId,
        ...(salesUserId ? { salesUserId } : {}),
        piDate: { gte: from },
        status: {
          in: [
            ProformaInvoiceStatus.ISSUED,
            ProformaInvoiceStatus.PENDING_BOOKING,
            ProformaInvoiceStatus.BOOKED,
            ProformaInvoiceStatus.PARTIALLY_DISPATCHED,
            ProformaInvoiceStatus.FULLY_DISPATCHED,
          ],
        },
      },
      include: {
        customer: { select: { id: true, customerName: true } },
        salesUser: { select: { name: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { piDate: "desc" },
      take: 200,
    }),
    prisma.proformaInvoice.findMany({
      where: {
        companyId,
        ...(salesUserId ? { salesUserId } : {}),
        piDate: { gte: from },
        status: {
          in: [
            ProformaInvoiceStatus.DRAFT,
            ProformaInvoiceStatus.ISSUED,
            ProformaInvoiceStatus.PENDING_BOOKING,
          ],
        },
      },
      include: {
        customer: { select: { customerName: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
    }),
  ]);

  const expiringQuotations: WorkQueueItem[] = expiringRows.map((row) => {
    const expiry = row.expiryDate.toISOString().slice(0, 10);
    let urgency: "today" | "soon" | "expired" = "soon";
    if (row.status === QuotationStatus.EXPIRED || expiry < today) urgency = "expired";
    else if (expiry === today) urgency = "today";
    return {
      kind: "expiring_quotation",
      id: row.id,
      quotationNo: row.quotationNo,
      customerName: row.customer.customerName,
      expiryDate: expiry,
      urgency,
      href: `/sales/quotations/${row.id}`,
    };
  });

  const bookedNotDispatched = bookedRows.map((pi) => {
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

  const highOutstanding = outstandingRows
    .map((pi) => {
      const piValue = decimalToNumber(pi.totalValue);
      const paid = pi.payments.reduce(
        (sum, payment) => sum + decimalToNumber(payment.amount),
        0,
      );
      const outstanding = calculateOutstanding(piValue, paid);
      if (outstanding <= 0) return null;
      return {
        customerId: pi.customer.id,
        customerName: pi.customer.customerName,
        outstanding,
        ageingDays: calculateAgeingDays(pi.piDate),
        executiveName: pi.salesUser.name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.outstanding ?? 0) - (a?.outstanding ?? 0))
    .slice(0, 20) as PipelineRiskDto["highOutstanding"];

  const stuckPis: WorkQueueItem[] = stuckRows
    .map((pi) => {
      const updatedDays = Math.max(
        0,
        Math.floor((Date.now() - pi.updatedAt.getTime()) / 86_400_000),
      );
      const threshold =
        pi.status === ProformaInvoiceStatus.DRAFT
          ? STUCK_PI_DRAFT_DAYS
          : STUCK_PI_ISSUED_DAYS;
      if (updatedDays < threshold) return null;
      return {
        kind: "stuck_pi" as const,
        id: pi.id,
        piNo: pi.piNo,
        customerName: pi.customer.customerName,
        status: pi.status,
        daysInStatus: updatedDays,
        piValue: decimalToNumber(pi.totalValue),
        href: `/sales/proforma-invoices/${pi.id}`,
      };
    })
    .filter(Boolean)
    .slice(0, 50) as WorkQueueItem[];

  return {
    expiringQuotations,
    bookedNotDispatched,
    highOutstanding,
    stuckPis,
  };
}
