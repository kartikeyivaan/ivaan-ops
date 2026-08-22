import {
  CustomerType,
  DispatchStatus,
  QuotationStatus,
  Prisma,
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

/** SQL factor matching incentiveCreditFactor (null → 100, clamped 0–100). */
const SQL_INCENTIVE_FACTOR = Prisma.sql`(LEAST(100::numeric, GREATEST(0::numeric, COALESCE(c.incentive_credit_percent, 100))) / 100)`;

type DualSumRow = {
  actual: Prisma.Decimal | number | string | null;
  counted: Prisma.Decimal | number | string | null;
};

type ExecDualSumRow = DualSumRow & { salesUserId: string };

type CategoryDualSumRow = DualSumRow & { category: string };

type ExecCategoryDualSumRow = DualSumRow & { salesUserId: string; category: string };

function dualFromSumRow(row: DualSumRow | undefined): DualMetric {
  return roundDualMoney({
    actual: decimalToNumber(row?.actual ?? 0),
    counted: decimalToNumber(row?.counted ?? 0),
  });
}

function sqlCompanyEquals(columnSql: Prisma.Sql, companyId: CompanyIdFilter): Prisma.Sql {
  if (typeof companyId === "string") {
    return Prisma.sql`${columnSql} = ${companyId}::uuid`;
  }
  return Prisma.sql`${columnSql} IN (${Prisma.join(
    companyId.in.map((id) => Prisma.sql`${id}::uuid`),
  )})`;
}

function sqlAndDateRange(
  columnSql: Prisma.Sql,
  fromDate?: Date,
  toDate?: Date,
): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (fromDate) parts.push(Prisma.sql`${columnSql} >= ${fromDate}`);
  if (toDate) parts.push(Prisma.sql`${columnSql} <= ${toDate}`);
  if (parts.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.join(parts, " AND ")}`;
}

function sqlAndOptional(
  condition: Prisma.Sql | null | undefined,
): Prisma.Sql {
  return condition ?? Prisma.empty;
}

function dualSumSelect(valueSql: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    COALESCE(SUM(${valueSql}), 0) AS actual,
    COALESCE(SUM(${valueSql} * ${SQL_INCENTIVE_FACTOR}), 0) AS counted
  `;
}

function mapExecDualSums(rows: ExecDualSumRow[]): Map<string, DualMetric> {
  const map = new Map<string, DualMetric>();
  for (const row of rows) {
    map.set(row.salesUserId, dualFromSumRow(row));
  }
  return map;
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
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<DualSumRow[]>`
    SELECT ${dualSumSelect(Prisma.sql`q.total_value`)}
    FROM quotations q
    INNER JOIN customers c ON c.id = q.customer_id
    WHERE ${sqlCompanyEquals(Prisma.sql`q.company_id`, filters.companyId)}
      AND q.status <> CAST(${QuotationStatus.DRAFT} AS "QuotationStatus")
      ${sqlAndOptional(
        filters.salesUserId
          ? Prisma.sql`AND q.sales_user_id = ${filters.salesUserId}::uuid`
          : null,
      )}
      ${sqlAndDateRange(Prisma.sql`q.quotation_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
  `;
  return dualFromSumRow(rows[0]);
}

export async function buildPiValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<DualMetric> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<DualSumRow[]>`
    SELECT ${dualSumSelect(Prisma.sql`pi.total_value`)}
    FROM proforma_invoices pi
    INNER JOIN customers c ON c.id = pi.customer_id
    WHERE ${sqlCompanyEquals(Prisma.sql`pi.company_id`, filters.companyId)}
      ${sqlAndOptional(
        filters.salesUserId
          ? Prisma.sql`AND pi.sales_user_id = ${filters.salesUserId}::uuid`
          : null,
      )}
      ${sqlAndDateRange(Prisma.sql`pi.pi_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
  `;
  return dualFromSumRow(rows[0]);
}

export async function buildCollectionValueAggregate(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<DualMetric> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<DualSumRow[]>`
    SELECT ${dualSumSelect(Prisma.sql`p.amount`)}
    FROM payments p
    INNER JOIN customers c ON c.id = p.customer_id
    INNER JOIN proforma_invoices pi ON pi.id = p.proforma_invoice_id
    WHERE ${sqlCompanyEquals(Prisma.sql`pi.company_id`, filters.companyId)}
      ${sqlAndOptional(
        filters.salesUserId
          ? Prisma.sql`AND pi.sales_user_id = ${filters.salesUserId}::uuid`
          : null,
      )}
      ${sqlAndDateRange(Prisma.sql`p.payment_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
  `;
  return dualFromSumRow(rows[0]);
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
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<CategoryDualSumRow[]>`
    SELECT
      pc.name AS category,
      COALESCE(SUM(dl.qty), 0) AS actual,
      COALESCE(SUM(dl.qty * ${SQL_INCENTIVE_FACTOR}), 0) AS counted
    FROM dispatch_lines dl
    INNER JOIN dispatches d ON d.id = dl.dispatch_id
    INNER JOIN customers c ON c.id = d.customer_id
    INNER JOIN products p ON p.id = dl.product_id
    INNER JOIN product_categories pc ON pc.id = p.category_id
    INNER JOIN proforma_invoices pi ON pi.id = d.proforma_invoice_id
    WHERE ${sqlCompanyEquals(Prisma.sql`d.company_id`, filters.companyId)}
      AND d.status = CAST(${DispatchStatus.DISPATCHED} AS "DispatchStatus")
      ${sqlAndOptional(
        filters.salesUserId
          ? Prisma.sql`AND pi.sales_user_id = ${filters.salesUserId}::uuid`
          : null,
      )}
      ${sqlAndDateRange(Prisma.sql`d.dispatch_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
      AND pc.name IN ('Modules', 'Inverters', 'Other')
    GROUP BY pc.name
  `;

  const totals: DispatchedUnitTotals = {
    modules: emptyDualMetric(),
    inverters: emptyDualMetric(),
    other: emptyDualMetric(),
  };
  for (const row of rows) {
    const dual = {
      actual: decimalToNumber(row.actual ?? 0),
      counted: decimalToNumber(row.counted ?? 0),
    };
    if (row.category === "Modules") totals.modules = dual;
    else if (row.category === "Inverters") totals.inverters = dual;
    else if (row.category === "Other") totals.other = dual;
  }
  return {
    modules: roundDualUnits(totals.modules),
    inverters: roundDualUnits(totals.inverters),
    other: roundDualUnits(totals.other),
  };
}

export async function buildNewCustomersCount(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<DualMetric> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<DualSumRow[]>`
    SELECT
      COUNT(*)::numeric AS actual,
      COUNT(*) FILTER (
        WHERE LEAST(100::numeric, GREATEST(0::numeric, COALESCE(c.incentive_credit_percent, 100))) > 0
      )::numeric AS counted
    FROM customers c
    WHERE TRUE
      ${sqlAndOptional(
        filters.salesUserId
          ? Prisma.sql`AND c.assigned_sales_user_id = ${filters.salesUserId}::uuid`
          : null,
      )}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
      ${sqlAndDateRange(Prisma.sql`c.created_at`, fromDate, toDate)}
  `;
  return {
    actual: decimalToNumber(rows[0]?.actual ?? 0),
    counted: decimalToNumber(rows[0]?.counted ?? 0),
  };
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

  const [quotationValue, piValue, collectionValue, dispatchedValue, units, newCustomers] =
    await Promise.all([
      buildQuotationValueAggregate(prisma, scoped),
      buildPiValueAggregate(prisma, scoped),
      buildCollectionValueAggregate(prisma, scoped),
      buildDispatchedValueAggregate(prisma, scoped),
      buildDispatchedUnitTotals(prisma, scoped),
      buildNewCustomersCount(prisma, scoped),
    ]);

  return finalizeExecutiveKpi({
    executiveId: executive.id,
    executiveName: executive.name,
    executiveEmail: executive.email,
    quotationValue,
    piValue,
    collectionValue,
    dispatchedValue,
    moduleUnits: units.modules,
    inverterUnits: units.inverters,
    otherUnits: units.other,
    newCustomers,
  });
}

async function groupQuotationValueByExecutive(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<Map<string, DualMetric>> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<ExecDualSumRow[]>`
    SELECT
      q.sales_user_id AS "salesUserId",
      ${dualSumSelect(Prisma.sql`q.total_value`)}
    FROM quotations q
    INNER JOIN customers c ON c.id = q.customer_id
    WHERE ${sqlCompanyEquals(Prisma.sql`q.company_id`, filters.companyId)}
      AND q.status <> CAST(${QuotationStatus.DRAFT} AS "QuotationStatus")
      ${sqlAndDateRange(Prisma.sql`q.quotation_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
    GROUP BY q.sales_user_id
  `;
  return mapExecDualSums(rows);
}

async function groupPiValueByExecutive(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<Map<string, DualMetric>> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<ExecDualSumRow[]>`
    SELECT
      pi.sales_user_id AS "salesUserId",
      ${dualSumSelect(Prisma.sql`pi.total_value`)}
    FROM proforma_invoices pi
    INNER JOIN customers c ON c.id = pi.customer_id
    WHERE ${sqlCompanyEquals(Prisma.sql`pi.company_id`, filters.companyId)}
      ${sqlAndDateRange(Prisma.sql`pi.pi_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
    GROUP BY pi.sales_user_id
  `;
  return mapExecDualSums(rows);
}

async function groupCollectionValueByExecutive(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<Map<string, DualMetric>> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<ExecDualSumRow[]>`
    SELECT
      pi.sales_user_id AS "salesUserId",
      ${dualSumSelect(Prisma.sql`p.amount`)}
    FROM payments p
    INNER JOIN customers c ON c.id = p.customer_id
    INNER JOIN proforma_invoices pi ON pi.id = p.proforma_invoice_id
    WHERE ${sqlCompanyEquals(Prisma.sql`pi.company_id`, filters.companyId)}
      ${sqlAndDateRange(Prisma.sql`p.payment_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
    GROUP BY pi.sales_user_id
  `;
  return mapExecDualSums(rows);
}

async function groupNewCustomersByExecutive(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<Map<string, DualMetric>> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<ExecDualSumRow[]>`
    SELECT
      c.assigned_sales_user_id AS "salesUserId",
      COUNT(*)::numeric AS actual,
      COUNT(*) FILTER (
        WHERE LEAST(100::numeric, GREATEST(0::numeric, COALESCE(c.incentive_credit_percent, 100))) > 0
      )::numeric AS counted
    FROM customers c
    WHERE TRUE
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
      ${sqlAndDateRange(Prisma.sql`c.created_at`, fromDate, toDate)}
    GROUP BY c.assigned_sales_user_id
  `;
  return mapExecDualSums(rows);
}

async function groupDispatchedUnitsByExecutive(
  prisma: PrismaClient,
  filters: SalesMetricFilters,
): Promise<Map<string, DispatchedUnitTotals>> {
  const { fromDate, toDate } = resolveDateBounds(filters);
  const rows = await prisma.$queryRaw<ExecCategoryDualSumRow[]>`
    SELECT
      pi.sales_user_id AS "salesUserId",
      pc.name AS category,
      COALESCE(SUM(dl.qty), 0) AS actual,
      COALESCE(SUM(dl.qty * ${SQL_INCENTIVE_FACTOR}), 0) AS counted
    FROM dispatch_lines dl
    INNER JOIN dispatches d ON d.id = dl.dispatch_id
    INNER JOIN customers c ON c.id = d.customer_id
    INNER JOIN products p ON p.id = dl.product_id
    INNER JOIN product_categories pc ON pc.id = p.category_id
    INNER JOIN proforma_invoices pi ON pi.id = d.proforma_invoice_id
    WHERE ${sqlCompanyEquals(Prisma.sql`d.company_id`, filters.companyId)}
      AND d.status = CAST(${DispatchStatus.DISPATCHED} AS "DispatchStatus")
      ${sqlAndDateRange(Prisma.sql`d.dispatch_date`, fromDate, toDate)}
      ${sqlAndOptional(
        filters.customerType
          ? Prisma.sql`AND c.customer_type = CAST(${filters.customerType} AS "CustomerType")`
          : null,
      )}
      AND pc.name IN ('Modules', 'Inverters', 'Other')
    GROUP BY pi.sales_user_id, pc.name
  `;

  const map = new Map<string, DispatchedUnitTotals>();
  for (const row of rows) {
    const entry = map.get(row.salesUserId) ?? {
      modules: emptyDualMetric(),
      inverters: emptyDualMetric(),
      other: emptyDualMetric(),
    };
    const dual = {
      actual: decimalToNumber(row.actual ?? 0),
      counted: decimalToNumber(row.counted ?? 0),
    };
    if (row.category === "Modules") entry.modules = dual;
    else if (row.category === "Inverters") entry.inverters = dual;
    else if (row.category === "Other") entry.other = dual;
    map.set(row.salesUserId, entry);
  }
  for (const [id, units] of map) {
    map.set(id, {
      modules: roundDualUnits(units.modules),
      inverters: roundDualUnits(units.inverters),
      other: roundDualUnits(units.other),
    });
  }
  return map;
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

  const [
    quotationByExec,
    piByExec,
    collectionByExec,
    newCustomersByExec,
    unitsByExec,
    dispatches,
  ] = await Promise.all([
    groupQuotationValueByExecutive(prisma, base),
    groupPiValueByExecutive(prisma, base),
    groupCollectionValueByExecutive(prisma, base),
    groupNewCustomersByExecutive(prisma, base),
    groupDispatchedUnitsByExecutive(prisma, base),
    fetchDispatchesForMetrics(prisma, base),
  ]);

  const kitBomMap = await loadKitBomMapForDispatches(prisma, dispatches);
  const byExec = new Map<string, ExecutiveKpiSummary>();

  for (const executive of executives) {
    const units = unitsByExec.get(executive.id) ?? {
      modules: emptyDualMetric(),
      inverters: emptyDualMetric(),
      other: emptyDualMetric(),
    };
    byExec.set(executive.id, {
      ...emptyExecutiveKpi(executive),
      quotationValue: quotationByExec.get(executive.id) ?? emptyDualMetric(),
      piValue: piByExec.get(executive.id) ?? emptyDualMetric(),
      collectionValue: collectionByExec.get(executive.id) ?? emptyDualMetric(),
      newCustomers: newCustomersByExec.get(executive.id) ?? emptyDualMetric(),
      moduleUnits: units.modules,
      inverterUnits: units.inverters,
      otherUnits: units.other,
    });
  }

  for (const dispatch of dispatches) {
    const execId = dispatch.proformaInvoice.salesUserId;
    const entry = byExec.get(execId);
    if (!entry) continue;
    entry.dispatchedValue = addDualMetric(
      entry.dispatchedValue,
      sumDispatchedValueFromLines([dispatch], kitBomMap),
    );
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
  /** Current-period unit actuals (avoids a second dispatch/unit query on dashboards). */
  unitComposition: {
    modules: number;
    inverters: number;
    other: number;
  };
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
    unitComposition: {
      modules: units.modules.actual,
      inverters: units.inverters.actual,
      other: units.other.actual,
    },
    period,
    fromDate: filters.fromDate ?? "",
    toDate: filters.toDate ?? "",
  };
}
