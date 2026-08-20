import type { PrismaClient } from "@prisma/client";
import { getPaymentFollowupReport } from "@/lib/report-service";
import {
  calculateAgeingDays,
  getAgeingBucket,
  type AgeingBucket,
} from "@/lib/reports";
import { roundMoney } from "@/lib/quotations";
import type { OutstandingAgingDto } from "@/lib/sales-dashboard/dashboard-types";

export async function getOutstandingAging(
  prisma: PrismaClient,
  companyId: string,
  salesUserId?: string,
): Promise<OutstandingAgingDto> {
  const rows = await getPaymentFollowupReport(prisma, companyId, {
    salesUserId,
  });

  const bucketTotals = new Map<AgeingBucket, { total: number; count: number }>();
  const buckets: AgeingBucket[] = ["0-30", "31-60", "61-90", "90+"];
  for (const bucket of buckets) {
    bucketTotals.set(bucket, { total: 0, count: 0 });
  }

  let totalOutstanding = 0;
  for (const row of rows) {
    totalOutstanding += row.outstanding;
    const bucket = getAgeingBucket(row.ageingDays);
    const entry = bucketTotals.get(bucket)!;
    entry.total += row.outstanding;
    entry.count += 1;
  }

  return {
    totalOutstanding: roundMoney(totalOutstanding),
    buckets: buckets.map((bucket) => {
      const entry = bucketTotals.get(bucket)!;
      return {
        bucket,
        totalOutstanding: roundMoney(entry.total),
        piCount: entry.count,
      };
    }),
  };
}

export { calculateAgeingDays, getAgeingBucket };
