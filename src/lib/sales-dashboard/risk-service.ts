import type { PrismaClient } from "@prisma/client";
import { getWorkQueue } from "@/lib/sales-dashboard/work-queue-service";
import { getBookedNotDispatchedRisks } from "@/lib/sales-dashboard/team-service";
import { decimalToNumber } from "@/lib/inventory";
import { calculateAgeingDays, calculateOutstanding } from "@/lib/reports";
import { ProformaInvoiceStatus } from "@prisma/client";
import type { PipelineRiskDto } from "@/lib/sales-dashboard/dashboard-types";

export async function getPipelineRisks(
  prisma: PrismaClient,
  companyId: string,
  salesUserId?: string,
): Promise<PipelineRiskDto> {
  const [workQueue, bookedNotDispatched, followupRows] = await Promise.all([
    getWorkQueue(prisma, companyId, salesUserId),
    getBookedNotDispatchedRisks(prisma, companyId, salesUserId),
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
            ProformaInvoiceStatus.FULLY_DISPATCHED,
          ],
        },
      },
      include: {
        customer: { select: { id: true, customerName: true } },
        salesUser: { select: { name: true } },
        payments: { select: { amount: true } },
      },
      take: 200,
    }),
  ]);

  const highOutstanding = followupRows
    .map((pi) => {
      const piValue = decimalToNumber(pi.totalValue);
      const paid = pi.payments.reduce(
        (sum, payment) => sum + decimalToNumber(payment.amount),
        0,
      );
      const outstanding = calculateOutstanding(piValue, paid);
      if (outstanding <= 0) return null;
      const ageingDays = calculateAgeingDays(pi.piDate);
      if (ageingDays < 61) return null;
      return {
        customerId: pi.customer.id,
        customerName: pi.customer.customerName,
        outstanding,
        ageingDays,
        executiveName: pi.salesUser.name,
      };
    })
    .filter(Boolean)
    .slice(0, 20) as PipelineRiskDto["highOutstanding"];

  return {
    expiringQuotations: workQueue.expiringQuotations,
    bookedNotDispatched,
    highOutstanding,
    stuckPis: workQueue.stuckPis,
  };
}
