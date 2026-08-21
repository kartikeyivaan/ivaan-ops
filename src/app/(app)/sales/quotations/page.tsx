import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canManageQuotations,
  canViewQuotations,
} from "@/lib/quotation-permissions";
import { listQuotations } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { listSalesExecutivesForCompany } from "@/lib/report-builders";
import {
  FIRM_SALES_SCOPE,
  isFirmSalesScope,
  restrictSalesUserId,
} from "@/lib/report-permissions";
import { ROLES } from "@/lib/rbac";
import { canViewTeamSalesDashboard } from "@/lib/sales-dashboard/dashboard-permissions";
import { requireActiveCompany } from "@/lib/session";
import { quotationSearchSchema } from "@/lib/validations";
import { QuotationsList } from "@/components/quotations/quotations-list";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function QuotationsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewQuotations(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const params = await searchParams;
  const rawSalesUserId = first(params.salesUserId);
  const firmWideRequested = isFirmSalesScope(rawSalesUserId);
  const parsed = quotationSearchSchema.safeParse({
    q: first(params.q),
    status: first(params.status),
    customerId: first(params.customerId),
    salesUserId:
      rawSalesUserId && !firmWideRequested ? rawSalesUserId : undefined,
    fromDate: first(params.fromDate),
    toDate: first(params.toDate),
    expiry: first(params.expiry),
  });

  const filters = parsed.success ? parsed.data : {};
  const salesUserId = restrictSalesUserId(
    session.user.roles,
    session.user.id,
    firmWideRequested ? FIRM_SALES_SCOPE : filters.salesUserId,
  );
  const canFilterByExecutive = canViewTeamSalesDashboard(session.user.roles);
  const canViewFirmWide =
    !canFilterByExecutive &&
    session.user.roles.includes(ROLES.SALES_EXECUTIVE);

  const [quotations, salesExecutives] = await Promise.all([
    listQuotations(prisma, companyId, {
      ...filters,
      salesUserId,
    }),
    canFilterByExecutive
      ? listSalesExecutivesForCompany(prisma, companyId)
      : Promise.resolve([]),
  ]);

  return (
    <QuotationsList
      initialQuotations={JSON.parse(JSON.stringify(quotations))}
      salesExecutives={salesExecutives}
      canManage={canManageQuotations(session.user.roles)}
      canFilterByExecutive={canFilterByExecutive}
      canViewFirmWide={canViewFirmWide}
      initialFilters={{
        q: filters.q ?? "",
        status: filters.status ?? "",
        fromDate: filters.fromDate ?? "",
        toDate: filters.toDate ?? "",
        salesUserId: firmWideRequested
          ? FIRM_SALES_SCOPE
          : (salesUserId ?? ""),
        expiry: filters.expiry ?? "",
      }}
    />
  );
}
