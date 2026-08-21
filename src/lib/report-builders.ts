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
import {
  addDualMetric,
  applyIncentiveCredit,
  emptyDualMetric,
  newCustomerCreditCount,
  roundDualMoney,
  roundDualUnits,
  type DualMetric,
} from "@/lib/incentive-credit";
import {
  loadKitBomMapForDispatches,
  sumCommercialValueFromDispatchLines,
  type DispatchCommercialValueLine,
} from "@/lib/dispatch-value";
import { decimalToNumber } from "@/lib/inventory";
import type { KitBomComponent } from "@/lib/kit-fulfillment";
import { roundMoney } from "@/lib/quotations";
import { ROLES } from "@/lib/rbac";

export type { DualMetric } from "@/lib/incentive-credit";

export type CompanyIdFilter = string | { in: string[] };

export type SalesMetricFilters = {
  companyId: CompanyIdFilter;
  salesUserId?: string;
  fromDate?: string;
  toDate?: string;
  customerType?: CustomerType;
};

/** Prisma-friendly company filter from one or many IDs. */
export function toCompanyIdFilter(companyIds: string | string[]): CompanyIdFilter {
  if (Array.isArray(companyIds)) {
    if (companyIds.length === 0) {
      throw new Error("COMPANY_REQUIRED");
    }
    return companyIds.length === 1 ? companyIds[0]! : { in: companyIds };
  }
  return companyIds;
}

export function toCompanyIdList(companyId: CompanyIdFilter): string[] {
  return typeof companyId === "string" ? [companyId] : companyId.in;
}

const incentivePercentSelect = {
  select: { incentiveCreditPercent: true },
} as const;

export type ExecutiveKpiSummary = {
  executiveId: string;
  executiveName: string;
  executiveEmail: string;
  quotationValue: DualMetric;
  piValue: DualMetric;
  collectionValue: DualMetric;
  dispatchedValue: DualMetric;
  moduleUnits: DualMetric;
  inverterUnits: DualMetric;
  otherUnits: DualMetric;
  newCustomers: DualMetric;
};

export type DispatchedUnitTotals = {
  modules: DualMetric;
  inverters: DualMetric;
  other: DualMetric;
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
  rows: ReadonlyArray<{
    totalValue: Prisma.Decimal | number | string;
    customer?: { incentiveCreditPercent: Prisma.Decimal | number | string } | null;
  }>,
): DualMetric {
  return roundDualMoney(
    rows.reduce((sum, row) => {
      const dual = applyIncentiveCredit(
        decimalToNumber(row.totalValue),
        row.customer?.incentiveCreditPercent,
      );
      return addDualMetric(sum, dual);
    }, emptyDualMetric()),
  );
}

export function sumPaymentAmounts(
  rows: ReadonlyArray<{
    amount: Prisma.Decimal | number | string;
    customer?: { incentiveCreditPercent: Prisma.Decimal | number | string } | null;
  }>,
): DualMetric {
  return roundDualMoney(
    rows.reduce((sum, row) => {
      const dual = applyIncentiveCredit(
        decimalToNumber(row.amount),
        row.customer?.incentiveCreditPercent,
      );
      return addDualMetric(sum, dual);
    }, emptyDualMetric()),
  );
}

export function sumDispatchedValueFromLines(
  dispatches: ReadonlyArray<{
    customer?: { incentiveCreditPercent: Prisma.Decimal | number | string } | null;
    lines: ReadonlyArray<DispatchCommercialValueLine>;
  }>,
  kitBomMap: ReadonlyMap<string, KitBomComponent[]> = new Map(),
): DualMetric {
  return roundDualMoney(
    dispatches.reduce((sum, dispatch) => {
      const lineTotal = sumCommercialValueFromDispatchLines(dispatch.lines, kitBomMap);
      return addDualMetric(
        sum,
        applyIncentiveCredit(lineTotal, dispatch.customer?.incentiveCreditPercent),
      );
    }, emptyDualMetric()),
  );
}

export function sumDispatchedUnitsFromLines(
  dispatches: ReadonlyArray<{
    customer?: { incentiveCreditPercent: Prisma.Decimal | number | string } | null;
    lines: ReadonlyArray<{
      qty: Prisma.Decimal | number | string;
      product: { category: { name: string } };
    }>;
  }>,
): DispatchedUnitTotals {
  const totals: DispatchedUnitTotals = {
    modules: emptyDualMetric(),
    inverters: emptyDualMetric(),
    other: emptyDualMetric(),
  };
  for (const dispatch of dispatches) {
    const percent = dispatch.customer?.incentiveCreditPercent;
    for (const line of dispatch.lines) {
      const dual = applyIncentiveCredit(decimalToNumber(line.qty), percent);
      const category = line.product.category.name;
      if (category === "Modules") totals.modules = addDualMetric(totals.modules, dual);
      else if (category === "Inverters") {
        totals.inverters = addDualMetric(totals.inverters, dual);
      } else if (category === "Other") {
        totals.other = addDualMetric(totals.other, dual);
      }
    }
  }
  return {
    modules: roundDualUnits(totals.modules),
    inverters: roundDualUnits(totals.inverters),
    other: roundDualUnits(totals.other),
  };
}

export async function listSalesExecutivesForCompany(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
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
): Promise<DualMetric> {
  const rows = await prisma.quotation.findMany({
    where: buildQuotationWhere(filters),
    select: {
      totalValue: true,
      customer: incentivePercentSelect,
    },
  });
  return sumDocumentValues(rows);
}

export async function buildPiValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<DualMetric> {
  const rows = await prisma.proformaInvoice.findMany({
    where: buildPiWhere(filters),
    select: {
      totalValue: true,
      customer: incentivePercentSelect,
    },
  });
  return sumDocumentValues(rows);
}

export async function buildCollectionValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<DualMetric> {
  const rows = await prisma.payment.findMany({
    where: buildPaymentWhere(filters),
    select: {
      amount: true,
      customer: incentivePercentSelect,
    },
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
      customer: incentivePercentSelect,
      proformaInvoice: { select: { salesUserId: true } },
      lines: {
        select: {
          productId: true,
          qty: true,
          proformaInvoiceItem: {
            select: {
              id: true,
              rate: true,
              gstRate: true,
              product: {
                select: {
                  id: true,
                  pricingType: true,
                  capacity: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
          product: {
            select: {
              pricingType: true,
              capacity: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

export async function buildDispatchedValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<DualMetric> {
  const dispatches = await fetchDispatchesForMetrics(prisma, filters);
  const kitBomMap = await loadKitBomMapForDispatches(prisma, dispatches);
  return sumDispatchedValueFromLines(dispatches, kitBomMap);
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
): Promise<DualMetric> {
  const customers = await prisma.customer.findMany({
    where: buildNewCustomersWhere(filters),
    select: { incentiveCreditPercent: true },
  });
  return customers.reduce(
    (sum, customer) => addDualMetric(sum, newCustomerCreditCount(customer.incentiveCreditPercent)),
    emptyDualMetric(),
  );
}

function emptyExecutiveKpi(
  executive: { id: string; name: string; email: string },
): ExecutiveKpiSummary {
  return {
    executiveId: executive.id,
    executiveName: executive.name,
    executiveEmail: executive.email,
    quotationValue: emptyDualMetric(),
    piValue: emptyDualMetric(),
    collectionValue: emptyDualMetric(),
    dispatchedValue: emptyDualMetric(),
    moduleUnits: emptyDualMetric(),
    inverterUnits: emptyDualMetric(),
    otherUnits: emptyDualMetric(),
    newCustomers: emptyDualMetric(),
  };
}

function finalizeExecutiveKpi(row: ExecutiveKpiSummary): ExecutiveKpiSummary {
  return {
    ...row,
    quotationValue: roundDualMoney(row.quotationValue),
    piValue: roundDualMoney(row.piValue),
    collectionValue: roundDualMoney(row.collectionValue),
    dispatchedValue: roundDualMoney(row.dispatchedValue),
    moduleUnits: roundDualUnits(row.moduleUnits),
    inverterUnits: roundDualUnits(row.inverterUnits),
    otherUnits: roundDualUnits(row.otherUnits),
  };
}

function executiveKpiHasActivity(row: ExecutiveKpiSummary): boolean {
  return (
    row.quotationValue.actual > 0 ||
    row.piValue.actual > 0 ||
    row.collectionValue.actual > 0 ||
    row.dispatchedValue.actual > 0 ||
    row.moduleUnits.actual > 0 ||
    row.newCustomers.actual > 0
  );
}

export async function buildExecutiveKpiSummary(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
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
      select: { totalValue: true, customer: incentivePercentSelect },
    }),
    prisma.proformaInvoice.findMany({
      where: buildPiWhere(scoped),
      select: { totalValue: true, customer: incentivePercentSelect },
    }),
    prisma.payment.findMany({
      where: buildPaymentWhere(scoped),
      select: { amount: true, customer: incentivePercentSelect },
    }),
    fetchDispatchesForMetrics(prisma, scoped),
    buildNewCustomersCount(prisma, scoped),
  ]);

  const kitBomMap = await loadKitBomMapForDispatches(prisma, dispatches);
  const units = sumDispatchedUnitsFromLines(dispatches);

  return finalizeExecutiveKpi({
    executiveId: executive.id,
    executiveName: executive.name,
    executiveEmail: executive.email,
    quotationValue: sumDocumentValues(quotations),
    piValue: sumDocumentValues(pis),
    collectionValue: sumPaymentAmounts(payments),
    dispatchedValue: sumDispatchedValueFromLines(dispatches, kitBomMap),
    moduleUnits: units.modules,
    inverterUnits: units.inverters,
    otherUnits: units.other,
    newCustomers,
  });
}

export async function buildTeamKpiSummaries(
  prisma: PrismaClient,
  companyId: CompanyIdFilter,
  filters: Omit<SalesMetricFilters, "companyId" | "salesUserId">,
  salesUserId?: string,
): Promise<ExecutiveKpiSummary[]> {
  const executives = await listSalesExecutivesForCompany(prisma, companyId, salesUserId);
  if (executives.length === 0) return [];

  const base: SalesMetricFilters = { companyId, ...filters };

  const [quotations, pis, payments, dispatches, customers] = await Promise.all([
    prisma.quotation.findMany({
      where: buildQuotationWhere(base),
      select: {
        salesUserId: true,
        totalValue: true,
        customer: incentivePercentSelect,
      },
    }),
    prisma.proformaInvoice.findMany({
      where: buildPiWhere(base),
      select: {
        salesUserId: true,
        totalValue: true,
        customer: incentivePercentSelect,
      },
    }),
    prisma.payment.findMany({
      where: buildPaymentWhere(base),
      select: {
        amount: true,
        customer: incentivePercentSelect,
        proformaInvoice: { select: { salesUserId: true } },
      },
    }),
    fetchDispatchesForMetrics(prisma, base),
    prisma.customer.findMany({
      where: buildNewCustomersWhere(base),
      select: { assignedSalesUserId: true, incentiveCreditPercent: true },
    }),
  ]);

  const byExec = new Map<string, ExecutiveKpiSummary>();

  for (const executive of executives) {
    byExec.set(executive.id, emptyExecutiveKpi(executive));
  }

  for (const row of quotations) {
    const entry = byExec.get(row.salesUserId);
    if (!entry) continue;
    entry.quotationValue = addDualMetric(
      entry.quotationValue,
      applyIncentiveCredit(decimalToNumber(row.totalValue), row.customer.incentiveCreditPercent),
    );
  }
  for (const row of pis) {
    const entry = byExec.get(row.salesUserId);
    if (!entry) continue;
    entry.piValue = addDualMetric(
      entry.piValue,
      applyIncentiveCredit(decimalToNumber(row.totalValue), row.customer.incentiveCreditPercent),
    );
  }
  for (const row of payments) {
    const entry = byExec.get(row.proformaInvoice.salesUserId);
    if (!entry) continue;
    entry.collectionValue = addDualMetric(
      entry.collectionValue,
      applyIncentiveCredit(decimalToNumber(row.amount), row.customer.incentiveCreditPercent),
    );
  }
  for (const row of customers) {
    const entry = byExec.get(row.assignedSalesUserId);
    if (!entry) continue;
    entry.newCustomers = addDualMetric(
      entry.newCustomers,
      newCustomerCreditCount(row.incentiveCreditPercent),
    );
  }
  const kitBomMap = await loadKitBomMapForDispatches(prisma, dispatches);
  for (const dispatch of dispatches) {
    const execId = dispatch.proformaInvoice.salesUserId;
    const entry = byExec.get(execId);
    if (!entry) continue;
    entry.dispatchedValue = addDualMetric(
      entry.dispatchedValue,
      sumDispatchedValueFromLines([dispatch], kitBomMap),
    );
    const units = sumDispatchedUnitsFromLines([dispatch]);
    entry.moduleUnits = addDualMetric(entry.moduleUnits, units.modules);
    entry.inverterUnits = addDualMetric(entry.inverterUnits, units.inverters);
    entry.otherUnits = addDualMetric(entry.otherUnits, units.other);
  }

  return [...byExec.values()]
    .map(finalizeExecutiveKpi)
    .filter((row) => executiveKpiHasActivity(row) || Boolean(salesUserId));
}

export type PeriodComparison = {
  /** Incentive-counted value (used for period change %). */
  current: number;
  previous: number;
  changePercent: number | null;
  actualCurrent: number;
  actualPrevious: number;
};

export function computePeriodComparison(
  current: DualMetric | number,
  previous: DualMetric | number,
): PeriodComparison {
  const currentDual =
    typeof current === "number" ? { actual: current, counted: current } : current;
  const previousDual =
    typeof previous === "number" ? { actual: previous, counted: previous } : previous;

  if (previousDual.counted <= 0) {
    return {
      current: currentDual.counted,
      previous: previousDual.counted,
      changePercent: currentDual.counted > 0 ? 100 : null,
      actualCurrent: currentDual.actual,
      actualPrevious: previousDual.actual,
    };
  }
  const changePercent = roundMoney(
    ((currentDual.counted - previousDual.counted) / previousDual.counted) * 100,
  );
  return {
    current: currentDual.counted,
    previous: previousDual.counted,
    changePercent,
    actualCurrent: currentDual.actual,
    actualPrevious: previousDual.actual,
  };
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
