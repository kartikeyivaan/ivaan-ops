import type { PrismaClient } from "@prisma/client";
import {
  listPendingApprovalCounts,
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
    ids.map((companyId) =>
      listPendingApprovalCounts(prisma, companyId, userRoles, SALES_APPROVAL_TYPES),
    ),
  );
  const pending = pendingGroups.flat();

  const byType: Partial<Record<ApprovalType, number>> = {};
  let oldestMs: number | null = null;
  let total = 0;

  for (const item of pending) {
    if (item.count <= 0) continue;
    byType[item.type] = (byType[item.type] ?? 0) + item.count;
    total += item.count;
    if (item.oldestAt) {
      const ts = Date.parse(item.oldestAt);
      if (!Number.isNaN(ts)) {
        oldestMs = oldestMs == null ? ts : Math.min(oldestMs, ts);
      }
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
    total,
    oldestWaitingDays,
    byType,
  };
}
