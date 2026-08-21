import { redirect, notFound } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DashboardPeriod } from "@/lib/business-dates";
import {
  formatAllCompaniesLabel,
  isAllCompaniesScope,
} from "@/lib/company-scope";
import { operationalCompanies } from "@/lib/learning/mode";
import {
  resolveSalesDashboardScope,
  SalesDashboardAccessError,
} from "@/lib/sales-dashboard/dashboard-api";
import {
  canViewExecutivePerformanceDetail,
  canViewTeamSalesDashboard,
} from "@/lib/sales-dashboard/dashboard-permissions";
import { getExecutiveDashboard } from "@/lib/sales-dashboard/dashboard-service";
import { ExecutiveDashboardView } from "@/components/dashboard/executive-dashboard-view";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    period?: string;
    fromDate?: string;
    toDate?: string;
    trendMetric?: string;
  }>;
};

const VALID_PERIODS = new Set<DashboardPeriod>([
  "today",
  "week",
  "month",
  "quarter",
  "custom",
]);

function resolveCompanyLabel(session: Session) {
  const ops = operationalCompanies(session.user.companies ?? []);
  if (isAllCompaniesScope(session.user.activeCompanyId) && ops.length > 1) {
    return formatAllCompaniesLabel(ops);
  }
  const activeCompany = session.user.companies.find(
    (company) => company.id === session.user.activeCompanyId,
  );
  return activeCompany
    ? `${activeCompany.name} (${activeCompany.code})`
    : undefined;
}

export default async function ExecutivePerformancePage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id: executiveId } = await params;
  const queryParams = await searchParams;
  const roles = session.user.roles ?? [];

  if (!canViewTeamSalesDashboard(roles)) {
    redirect("/dashboard");
  }

  let scope;
  try {
    scope = resolveSalesDashboardScope(session);
  } catch (error) {
    if (error instanceof SalesDashboardAccessError) redirect("/dashboard");
    throw error;
  }

  if (
    !canViewExecutivePerformanceDetail(scope.roles, scope.userId, executiveId)
  ) {
    redirect("/dashboard");
  }

  const executive = await prisma.user.findFirst({
    where: {
      id: executiveId,
      companies: {
        some: {
          companyId: { in: scope.companyIds },
        },
      },
    },
    select: { id: true, name: true, email: true },
  });

  if (!executive) notFound();

  const period = VALID_PERIODS.has(queryParams.period as DashboardPeriod)
    ? (queryParams.period as DashboardPeriod)
    : "month";

  const executiveScope = {
    ...scope,
    restrictToUserId: executiveId,
  };

  const dashboard = await getExecutiveDashboard(prisma, executiveScope, {
    period,
    fromDate: queryParams.fromDate,
    toDate: queryParams.toDate,
    trendMetric:
      queryParams.trendMetric === "dispatch" ||
      queryParams.trendMetric === "collection" ||
      queryParams.trendMetric === "pi" ||
      queryParams.trendMetric === "modules"
        ? queryParams.trendMetric
        : "modules",
  });

  return (
    <ExecutiveDashboardView
      data={dashboard}
      userName={executive.name ?? executive.email}
      salesUserId={executiveId}
      companyLabel={resolveCompanyLabel(session)}
      backHref="/dashboard"
      pageHeading={`${executive.name ?? executive.email} · Performance`}
    />
  );
}
