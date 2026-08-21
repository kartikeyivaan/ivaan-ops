import {
  ApprovalModuleType,
  ApprovalRequestStatus,
  DispatchStatus,
  type PrismaClient,
} from "@prisma/client";
import { parseBusinessDate, getBusinessToday } from "@/lib/business-dates";
import { decimalToNumber } from "@/lib/inventory";
import {
  sumDispatchedUnitsFromLines,
  type CompanyIdFilter,
} from "@/lib/report-builders";
import type { DispatchTodayHeroDto } from "@/lib/sales-dashboard/dashboard-types";

type DispatchTodayOptions = {
  companyId: CompanyIdFilter;
  salesUserId?: string;
  businessDate?: string;
};

export async function getDispatchTodaySummary(
  prisma: PrismaClient,
  options: DispatchTodayOptions,
): Promise<DispatchTodayHeroDto> {
  const businessDate = options.businessDate ?? getBusinessToday();
  const todayDate = parseBusinessDate(businessDate);

  const executiveFilter = options.salesUserId
    ? { salesUserId: options.salesUserId }
    : {};

  const [dispatchTodayPis, todaysDispatched, pendingApprovals] = await Promise.all([
    prisma.proformaInvoice.findMany({
      where: {
        companyId: options.companyId,
        dispatchTodayDate: todayDate,
        ...executiveFilter,
      },
      select: {
        id: true,
        piNo: true,
        salesUserId: true,
        customer: { select: { customerName: true } },
        salesUser: { select: { name: true } },
        items: { select: { qty: true, dispatchedQty: true } },
        dispatches: {
          where: { status: DispatchStatus.DISPATCHED },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.dispatch.findMany({
      where: {
        companyId: options.companyId,
        status: DispatchStatus.DISPATCHED,
        dispatchDate: todayDate,
        ...(options.salesUserId
          ? { proformaInvoice: { salesUserId: options.salesUserId } }
          : {}),
      },
      select: {
        proformaInvoiceId: true,
        proformaInvoice: {
          select: {
            id: true,
            piNo: true,
            salesUserId: true,
            customer: { select: { customerName: true } },
            salesUser: { select: { name: true } },
          },
        },
        lines: {
          select: {
            qty: true,
            product: { select: { category: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.approvalRequest.findMany({
      where: {
        moduleType: ApprovalModuleType.DISPATCH_TODAY,
        status: ApprovalRequestStatus.PENDING,
      },
      select: { moduleId: true },
    }),
  ]);

  const blockedPiIds = new Set(pendingApprovals.map((row) => row.moduleId));
  const blockedPis =
    blockedPiIds.size === 0
      ? []
      : await prisma.proformaInvoice.findMany({
          where: {
            companyId: options.companyId,
            id: { in: [...blockedPiIds] },
            ...executiveFilter,
          },
          select: {
            id: true,
            piNo: true,
            salesUserId: true,
            customer: { select: { customerName: true } },
            salesUser: { select: { name: true } },
          },
        });

  const items: DispatchTodayHeroDto["items"] = [];
  const seenPi = new Set<string>();

  let completed = 0;
  let pending = 0;
  let blocked = 0;

  for (const pi of dispatchTodayPis) {
    seenPi.add(pi.id);
    const hasDispatched = pi.dispatches.length > 0;
    const fullyDispatched = pi.items.every(
      (item) => decimalToNumber(item.dispatchedQty) >= decimalToNumber(item.qty),
    );
    const isBlocked = blockedPiIds.has(pi.id) && !hasDispatched;
    const status = isBlocked
      ? "blocked"
      : hasDispatched || fullyDispatched
        ? "completed"
        : "pending";

    if (status === "completed") completed += 1;
    else if (status === "blocked") blocked += 1;
    else pending += 1;

    items.push({
      piId: pi.id,
      piNo: pi.piNo,
      customerName: pi.customer.customerName,
      status,
      salesUserId: pi.salesUserId,
      salesExecutiveName: pi.salesUser.name,
    });
  }

  for (const dc of todaysDispatched) {
    const pi = dc.proformaInvoice;
    if (seenPi.has(pi.id)) continue;
    seenPi.add(pi.id);
    completed += 1;
    items.push({
      piId: pi.id,
      piNo: pi.piNo,
      customerName: pi.customer.customerName,
      status: "completed",
      salesUserId: pi.salesUserId,
      salesExecutiveName: pi.salesUser.name,
    });
  }

  for (const pi of blockedPis) {
    if (seenPi.has(pi.id)) continue;
    seenPi.add(pi.id);
    blocked += 1;
    items.push({
      piId: pi.id,
      piNo: pi.piNo,
      customerName: pi.customer.customerName,
      status: "blocked",
      salesUserId: pi.salesUserId,
      salesExecutiveName: pi.salesUser.name,
    });
  }

  const units = sumDispatchedUnitsFromLines(todaysDispatched);
  const planned = items.length;
  const completionPercent =
    planned > 0 ? Math.round((completed / planned) * 100) : 0;

  return {
    businessDate,
    planned,
    completed,
    pending,
    blocked,
    completionPercent,
    moduleUnits: units.modules,
    inverterUnits: units.inverters,
    otherUnits: units.other,
    items,
  };
}
