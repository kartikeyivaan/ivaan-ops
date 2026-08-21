import type { PrismaClient } from "@prisma/client";
import {
  listPendingApprovals,
  type ApprovalType,
} from "@/lib/approvals-service";
import { getBusinessToday, parseBusinessDate } from "@/lib/business-dates";
import type { ApprovalSummaryDto } from "@/lib/sales-dashboard/dashboard-types";

const SALES_APPROVAL_TYPES: ApprovalType[] = [
  "PI_BOOKING",
  "PI_EDIT",
  "DISPATCH_TODAY",
  "PI_CANCEL",
  "QUOTATION_PRICE",
];

export async function getApprovalSummary(
  prisma: PrismaClient,
  companyIds: string | string[],
  userRoles: string[],
): Promise<ApprovalSummaryDto> {
  const ids = Array.isArray(companyIds) ? companyIds : [companyIds];
  const pendingGroups = await Promise.all(
    ids.map((companyId) => listPendingApprovals(prisma, companyId, userRoles)),
  );
  const pending = pendingGroups.flat();
  const salesPending = pending.filter((item) =>
    SALES_APPROVAL_TYPES.includes(item.type),
  );

  const byType: Partial<Record<ApprovalType, number>> = {};
  let oldestMs: number | null = null;

  for (const item of salesPending) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    const ts = Date.parse(item.requestedAt);
    if (!Number.isNaN(ts)) {
      oldestMs = oldestMs == null ? ts : Math.min(oldestMs, ts);
    }
  }

  const today = getBusinessToday();
  const oldestWaitingDays =
    oldestMs == null
      ? null
      : Math.max(
          0,
          Math.floor(
            (parseBusinessDate(today).getTime() - new Date(oldestMs).getTime()) /
              86_400_000,
          ),
        );

  return {
    total: salesPending.length,
    oldestWaitingDays,
    byType,
  };
}
