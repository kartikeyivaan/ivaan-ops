import {
  CustomerType,
  DispatchStatus,
  QuotationStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  endOfBusinessDay,
  parseBusinessDate,
  type DashboardPeriod,
} from "@/lib/business-dates";
import { decimalToNumber } from "@/lib/inventory";
import { roundMoney } from "@/lib/quotations";
import { ROLES } from "@/lib/rbac";

export type SalesMetricFilters = {
  companyId: string;
  salesUserId?: string;
  fromDate?: string;
  toDate?: string;
  customerType?: CustomerType;
};

export type ExecutiveKpiSummary = {
  executiveId: string;
  executiveName: string;
  executiveEmail: string;
  quotationValue: number;
  piValue: number;
  collectionValue: number;
  dispatchedValue: number;
  moduleUnits: number;
  inverterUnits: number;
  otherUnits: number;
  newCustomers: number;
};

export type DispatchedUnitTotals = {
  modules: number;
  inverters: number;
  other: number;
};

const SALES_ROLE_NAMES = [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN] as const;

function resolveDateBounds(filters: Pick<SalesMetricFilters, "fromDate" | "toDate">) {
  return {
    fromDate: filters.fromDate ? parseBusinessDate(filters.fromDate) : undefined,
    toDate: filters.toDate ? endOfBusinessDay(filters.toDate) : undefined,
  };
}

export function buildQuotationWhere(
  filters: SalesMetricFilters,
): Prisma.QuotationWhereInput {
  const { fromDate, toDate } = resolveDateBounds(filters);
  return {
    companyId: filters.companyId,
    ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
    status: { not: QuotationStatus.DRAFT },
    ...(fromDate || toDate
      ? {
          quotationDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(filters.customerType
      ? { customer: { customerType: filters.customerType } }
      : {}),
  };
}

export function buildPiWhere(filters: SalesMetricFilters): Prisma.ProformaInvoiceWhereInput {
  const { fromDate, toDate } = resolveDateBounds(filters);
  return {
    companyId: filters.companyId,
    ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
    ...(fromDate || toDate
      ? {
          piDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(filters.customerType
      ? { customer: { customerType: filters.customerType } }
      : {}),
  };
}

export function buildPaymentWhere(filters: SalesMetricFilters): Prisma.PaymentWhereInput {
  const { fromDate, toDate } = resolveDateBounds(filters);
  return {
    proformaInvoice: {
      companyId: filters.companyId,
      ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
      ...(filters.customerType
        ? { customer: { customerType: filters.customerType } }
        : {}),
    },
    ...(fromDate || toDate
      ? {
          paymentDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
}

export function buildDispatchWhere(filters: SalesMetricFilters): Prisma.DispatchWhereInput {
  const { fromDate, toDate } = resolveDateBounds(filters);
  return {
    companyId: filters.companyId,
    status: DispatchStatus.DISPATCHED,
    ...(filters.salesUserId
      ? { proformaInvoice: { salesUserId: filters.salesUserId } }
      : {}),
    ...(fromDate || toDate
      ? {
          dispatchDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(filters.customerType
      ? { customer: { customerType: filters.customerType } }
      : {}),
  };
}

export function buildNewCustomersWhere(
  filters: SalesMetricFilters,
): Prisma.CustomerWhereInput {
  const { fromDate, toDate } = resolveDateBounds(filters);
  return {
    ...(filters.salesUserId ? { assignedSalesUserId: filters.salesUserId } : {}),
    ...(filters.customerType ? { customerType: filters.customerType } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
}

export function sumDocumentValues(
  rows: ReadonlyArray<{ totalValue: Prisma.Decimal | number | string }>,
): number {
  return roundMoney(
    rows.reduce((sum, row) => sum + decimalToNumber(row.totalValue), 0),
  );
}

export function sumPaymentAmounts(
  rows: ReadonlyArray<{ amount: Prisma.Decimal | number | string }>,
): number {
  return roundMoney(rows.reduce((sum, row) => sum + decimalToNumber(row.amount), 0));
}

export function sumDispatchedValueFromLines(
  dispatches: ReadonlyArray<{
    lines: ReadonlyArray<{
      qty: Prisma.Decimal | number | string;
      proformaInvoiceItem: { rate: Prisma.Decimal | number | string };
    }>;
  }>,
): number {
  return roundMoney(
    dispatches.reduce((sum, dispatch) => {
      const lineTotal = dispatch.lines.reduce((lineSum, line) => {
        const rate = decimalToNumber(line.proformaInvoiceItem.rate);
        return lineSum + decimalToNumber(line.qty) * rate;
      }, 0);
      return sum + lineTotal;
    }, 0),
  );
}

export function sumDispatchedUnitsFromLines(
  dispatches: ReadonlyArray<{
    lines: ReadonlyArray<{
      qty: Prisma.Decimal | number | string;
      product: { category: { name: string } };
    }>;
  }>,
): DispatchedUnitTotals {
  const totals: DispatchedUnitTotals = { modules: 0, inverters: 0, other: 0 };
  for (const dispatch of dispatches) {
    for (const line of dispatch.lines) {
      const qty = decimalToNumber(line.qty);
      const category = line.product.category.name;
      if (category === "Modules") totals.modules += qty;
      else if (category === "Inverters") totals.inverters += qty;
      else if (category === "Other") totals.other += qty;
    }
  }
  return {
    modules: Math.round(totals.modules * 1000) / 1000,
    inverters: Math.round(totals.inverters * 1000) / 1000,
    other: Math.round(totals.other * 1000) / 1000,
  };
}

export async function listSalesExecutivesForCompany(
  prisma: PrismaClient,
  companyId: string,
  salesUserId?: string,
) {
  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      ...(salesUserId ? { id: salesUserId } : {}),
      roles: {
        some: {
          role: { name: { in: [...SALES_ROLE_NAMES] } },
        },
      },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function buildQuotationValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<number> {
  const rows = await prisma.quotation.findMany({
    where: buildQuotationWhere(filters),
    select: { totalValue: true },
  });
  return sumDocumentValues(rows);
}

export async function buildPiValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<number> {
  const rows = await prisma.proformaInvoice.findMany({
    where: buildPiWhere(filters),
    select: { totalValue: true },
  });
  return sumDocumentValues(rows);
}

export async function buildCollectionValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<number> {
  const rows = await prisma.payment.findMany({
    where: buildPaymentWhere(filters),
    select: { amount: true },
  });
  return sumPaymentAmounts(rows);
}

export async function fetchDispatchesForMetrics(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
) {
  return prisma.dispatch.findMany({
    where: buildDispatchWhere(filters),
    select: {
      id: true,
      proformaInvoice: { select: { salesUserId: true } },
      lines: {
        select: {
          qty: true,
          proformaInvoiceItem: { select: { rate: true } },
          product: { select: { category: { select: { name: true } } } },
        },
      },
    },
  });
}

export async function buildDispatchedValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<number> {
  const dispatches = await fetchDispatchesForMetrics(prisma, filters);
  return sumDispatchedValueFromLines(dispatches);
}

export async function buildDispatchedUnitTotals(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<DispatchedUnitTotals> {
  const dispatches = await fetchDispatchesForMetrics(prisma, filters);
  return sumDispatchedUnitsFromLines(dispatches);
}

export async function buildNewCustomersCount(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<number> {
  return prisma.customer.count({ where: buildNewCustomersWhere(filters) });
}

export async function buildExecutiveKpiSummary(
  prisma: PrismaClient,
  companyId: string,
  executive: { id: string; name: string; email: string },
  filters: Omit<SalesMetricFilters, "companyId" | "salesUserId">,
): Promise<ExecutiveKpiSummary> {
  const scoped: SalesMetricFilters = {
    companyId,
    salesUserId: executive.id,
    ...filters,
  };

  const [quotations, pis, payments, dispatches, newCustomers] = await Promise.all([
    prisma.quotation.findMany({
      where: buildQuotationWhere(scoped),
      select: { totalValue: true },
    }),
    prisma.proformaInvoice.findMany({
      where: buildPiWhere(scoped),
      select: { totalValue: true },
    }),
    prisma.payment.findMany({
      where: buildPaymentWhere(scoped),
      select: { amount: true },
    }),
    fetchDispatchesForMetrics(prisma, scoped),
    buildNewCustomersCount(prisma, scoped),
  ]);

  const units = sumDispatchedUnitsFromLines(dispatches);

  return {
    executiveId: executive.id,
    executiveName: executive.name,
    executiveEmail: executive.email,
    quotationValue: sumDocumentValues(quotations),
    piValue: sumDocumentValues(pis),
    collectionValue: sumPaymentAmounts(payments),
    dispatchedValue: sumDispatchedValueFromLines(dispatches),
    moduleUnits: units.modules,
    inverterUnits: units.inverters,
    otherUnits: units.other,
    newCustomers,
  };
}

export async function buildTeamKpiSummaries(
  prisma: PrismaClient,
  companyId: string,
  filters: Omit<SalesMetricFilters, "companyId" | "salesUserId">,
  salesUserId?: string,
): Promise<ExecutiveKpiSummary[]> {
  const executives = await listSalesExecutivesForCompany(prisma, companyId, salesUserId);
  if (executives.length === 0) return [];

  const base: SalesMetricFilters = { companyId, ...filters };

  const [quotations, pis, payments, dispatches, customerCounts] = await Promise.all([
    prisma.quotation.findMany({
      where: buildQuotationWhere(base),
      select: { salesUserId: true, totalValue: true },
    }),
    prisma.proformaInvoice.findMany({
      where: buildPiWhere(base),
      select: { salesUserId: true, totalValue: true },
    }),
    prisma.payment.findMany({
      where: buildPaymentWhere(base),
      select: {
        amount: true,
        proformaInvoice: { select: { salesUserId: true } },
      },
    }),
    fetchDispatchesForMetrics(prisma, base),
    prisma.customer.groupBy({
      by: ["assignedSalesUserId"],
      where: buildNewCustomersWhere(base),
      _count: { _all: true },
    }),
  ]);

  const byExec = new Map<string, ExecutiveKpiSummary>();

  for (const executive of executives) {
    byExec.set(executive.id, {
      executiveId: executive.id,
      executiveName: executive.name,
      executiveEmail: executive.email,
      quotationValue: 0,
      piValue: 0,
      collectionValue: 0,
      dispatchedValue: 0,
      moduleUnits: 0,
      inverterUnits: 0,
      otherUnits: 0,
      newCustomers: 0,
    });
  }

  for (const row of quotations) {
    const entry = byExec.get(row.salesUserId);
    if (entry) entry.quotationValue += decimalToNumber(row.totalValue);
  }
  for (const row of pis) {
    const entry = byExec.get(row.salesUserId);
    if (entry) entry.piValue += decimalToNumber(row.totalValue);
  }
  for (const row of payments) {
    const entry = byExec.get(row.proformaInvoice.salesUserId);
    if (entry) entry.collectionValue += decimalToNumber(row.amount);
  }
  for (const row of customerCounts) {
    const entry = byExec.get(row.assignedSalesUserId);
    if (entry) entry.newCustomers = row._count._all;
  }
  for (const dispatch of dispatches) {
    const execId = dispatch.proformaInvoice.salesUserId;
    const entry = byExec.get(execId);
    if (!entry) continue;
    entry.dispatchedValue += sumDispatchedValueFromLines([dispatch]);
    const units = sumDispatchedUnitsFromLines([dispatch]);
    entry.moduleUnits += units.modules;
    entry.inverterUnits += units.inverters;
    entry.otherUnits += units.other;
  }

  return [...byExec.values()]
    .map((row) => ({
      ...row,
      quotationValue: roundMoney(row.quotationValue),
      piValue: roundMoney(row.piValue),
      collectionValue: roundMoney(row.collectionValue),
      dispatchedValue: roundMoney(row.dispatchedValue),
      moduleUnits: Math.round(row.moduleUnits * 1000) / 1000,
      inverterUnits: Math.round(row.inverterUnits * 1000) / 1000,
      otherUnits: Math.round(row.otherUnits * 1000) / 1000,
    }))
    .filter(
      (row) =>
        row.quotationValue > 0 ||
        row.piValue > 0 ||
        row.collectionValue > 0 ||
        row.dispatchedValue > 0 ||
        row.moduleUnits > 0 ||
        row.newCustomers > 0 ||
        Boolean(salesUserId),
    );
}

export type PeriodComparison = {
  current: number;
  previous: number;
  changePercent: number | null;
};

export function computePeriodComparison(current: number, previous: number): PeriodComparison {
  if (previous <= 0) {
    return { current, previous, changePercent: current > 0 ? 100 : null };
  }
  const changePercent = roundMoney(((current - previous) / previous) * 100);
  return { current, previous, changePercent };
}

export type KpiStripDto = {
  quotationValue: PeriodComparison;
  piValue: PeriodComparison;
  collectionValue: PeriodComparison;
  dispatchedValue: PeriodComparison;
  moduleUnits: PeriodComparison;
  period: DashboardPeriod;
  fromDate: string;
  toDate: string;
};

export async function buildKpiStrip(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
  period: DashboardPeriod,
  previousRange: { fromDate: string; toDate: string },
): Promise<KpiStripDto> {
  const currentFilters = filters;
  const previousFilters: SalesMetricFilters = {
    ...filters,
    fromDate: previousRange.fromDate,
    toDate: previousRange.toDate,
  };

  const [
    quotationValue,
    piValue,
    collectionValue,
    dispatchedValue,
    units,
    prevQuotation,
    prevPi,
    prevCollection,
    prevDispatched,
    prevUnits,
  ] = await Promise.all([
    buildQuotationValueAggregate(prisma, currentFilters),
    buildPiValueAggregate(prisma, currentFilters),
    buildCollectionValueAggregate(prisma, currentFilters),
    buildDispatchedValueAggregate(prisma, currentFilters),
    buildDispatchedUnitTotals(prisma, currentFilters),
    buildQuotationValueAggregate(prisma, previousFilters),
    buildPiValueAggregate(prisma, previousFilters),
    buildCollectionValueAggregate(prisma, previousFilters),
    buildDispatchedValueAggregate(prisma, previousFilters),
    buildDispatchedUnitTotals(prisma, previousFilters),
  ]);

  return {
    quotationValue: computePeriodComparison(quotationValue, prevQuotation),
    piValue: computePeriodComparison(piValue, prevPi),
    collectionValue: computePeriodComparison(collectionValue, prevCollection),
    dispatchedValue: computePeriodComparison(dispatchedValue, prevDispatched),
    moduleUnits: computePeriodComparison(units.modules, prevUnits.modules),
    period,
    fromDate: filters.fromDate ?? "",
    toDate: filters.toDate ?? "",
  };
}
