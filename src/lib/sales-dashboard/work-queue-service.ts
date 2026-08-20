import {
  ProformaInvoiceStatus,
  QuotationStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  getBusinessToday,
  parseBusinessDate,
} from "@/lib/business-dates";
import { decimalToNumber } from "@/lib/inventory";
import { calculateOutstanding } from "@/lib/reports";
import { refreshExpiredQuotations } from "@/lib/quotation-service";
import type { WorkQueueDto, WorkQueueItem } from "@/lib/sales-dashboard/dashboard-types";

const QUIET_CUSTOMER_DAYS = 7;
const STUCK_PI_ISSUED_DAYS = 14;
const STUCK_PI_DRAFT_DAYS = 7;
const EXPIRING_SOON_DAYS = 3;

function addDaysToDateStringLocal(value: string, days: number): string {
  const date = parseBusinessDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getWorkQueue(
  prisma: PrismaClient,
  companyId: string,
  salesUserId?: string,
): Promise<WorkQueueDto> {
  const today = getBusinessToday();
  await refreshExpiredQuotations(prisma, companyId);

  const soonEnd = addDaysToDateStringLocal(today, EXPIRING_SOON_DAYS);

  const [expiringRows, paymentFollowupPis, assignedCustomers] = await Promise.all([
    prisma.quotation.findMany({
      where: {
        companyId,
        ...(salesUserId ? { salesUserId } : {}),
        OR: [
          { status: QuotationStatus.EXPIRED },
          {
            status: QuotationStatus.SENT,
            expiryDate: { lte: parseBusinessDate(soonEnd) },
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
          in: [
            ProformaInvoiceStatus.ISSUED,
            ProformaInvoiceStatus.PENDING_BOOKING,
            ProformaInvoiceStatus.BOOKED,
            ProformaInvoiceStatus.PARTIALLY_DISPATCHED,
          ],
        },
      },
      include: {
        customer: { select: { customerName: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { piDate: "asc" },
    }),
    prisma.customer.findMany({
      where: {
        ...(salesUserId ? { assignedSalesUserId: salesUserId } : {}),
      },
      select: { id: true, customerName: true, updatedAt: true },
      take: 500,
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

  const unpaidPis: WorkQueueItem[] = paymentFollowupPis
    .map((pi) => {
      const piValue = decimalToNumber(pi.totalValue);
      const paid = pi.payments.reduce(
        (sum, payment) => sum + decimalToNumber(payment.amount),
        0,
      );
      const outstanding = calculateOutstanding(piValue, paid);
      if (outstanding <= 0) return null;
      const piDate = pi.piDate.toISOString().slice(0, 10);
      const ageingDays = Math.max(
        0,
        Math.floor(
          (parseBusinessDate(today).getTime() - parseBusinessDate(piDate).getTime()) /
            86_400_000,
        ),
      );
      return {
        kind: "unpaid_pi" as const,
        id: pi.id,
        piNo: pi.piNo,
        customerName: pi.customer.customerName,
        piValue,
        paid,
        outstanding,
        ageingDays,
        href: `/sales/proforma-invoices/${pi.id}`,
      };
    })
    .filter(Boolean)
    .slice(0, 50) as WorkQueueItem[];

  const thresholdDate = addDaysToDateStringLocal(today, -QUIET_CUSTOMER_DAYS);
  const threshold = parseBusinessDate(thresholdDate);

  const [recentQuoteCustomers, recentPiCustomers, recentPaymentCustomers, recentDispatchCustomers] =
    await Promise.all([
      prisma.quotation.findMany({
        where: {
          companyId,
          ...(salesUserId ? { salesUserId } : {}),
          quotationDate: { gte: threshold },
        },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
      prisma.proformaInvoice.findMany({
        where: {
          companyId,
          ...(salesUserId ? { salesUserId } : {}),
          piDate: { gte: threshold },
        },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
      prisma.payment.findMany({
        where: {
          companyId,
          paymentDate: { gte: threshold },
          proformaInvoice: salesUserId ? { salesUserId } : undefined,
        },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
      prisma.dispatch.findMany({
        where: {
          companyId,
          dispatchDate: { gte: threshold },
          ...(salesUserId ? { proformaInvoice: { salesUserId } } : {}),
        },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
    ]);

  const activeCustomerIds = new Set<string>();
  for (const group of [
    recentQuoteCustomers,
    recentPiCustomers,
    recentPaymentCustomers,
    recentDispatchCustomers,
  ]) {
    for (const row of group) activeCustomerIds.add(row.customerId);
  }

  const quietCustomers: WorkQueueItem[] = assignedCustomers
    .filter((customer) => !activeCustomerIds.has(customer.id))
    .map((customer) => {
      const lastActivityDate = customer.updatedAt.toISOString().slice(0, 10);
      const inactiveDays = Math.max(
        0,
        Math.floor(
          (parseBusinessDate(today).getTime() - customer.updatedAt.getTime()) /
            86_400_000,
        ),
      );
      return {
        kind: "quiet_customer" as const,
        id: customer.id,
        customerName: customer.customerName,
        lastActivityDate,
        inactiveDays,
        href: `/sales/customers/${customer.id}`,
      };
    })
    .slice(0, 50);

  const stuckPis: WorkQueueItem[] = paymentFollowupPis
    .map((pi) => {
      const updatedDays = Math.max(
        0,
        Math.floor(
          (Date.now() - pi.updatedAt.getTime()) / 86_400_000,
        ),
      );
      const threshold =
        pi.status === ProformaInvoiceStatus.DRAFT
          ? STUCK_PI_DRAFT_DAYS
          : STUCK_PI_ISSUED_DAYS;
      if (updatedDays < threshold) return null;
      if (
        pi.status !== ProformaInvoiceStatus.DRAFT &&
        pi.status !== ProformaInvoiceStatus.ISSUED &&
        pi.status !== ProformaInvoiceStatus.PENDING_BOOKING
      ) {
        return null;
      }
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
    unpaidPis,
    quietCustomers,
    stuckPis,
    counts: {
      expiringQuotations: expiringQuotations.length,
      unpaidPis: unpaidPis.length,
      quietCustomers: quietCustomers.length,
      stuckPis: stuckPis.length,
    },
  };
}
