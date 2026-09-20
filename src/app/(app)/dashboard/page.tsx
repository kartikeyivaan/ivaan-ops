import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { ROLES } from "@/lib/rbac";
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
  canViewSalesDashboard,
  canViewTeamSalesDashboard,
} from "@/lib/sales-dashboard/dashboard-permissions";
import {
  getCachedExecutiveDashboard,
  getCachedLegacyDashboard,
  getCachedManagerDashboard,
  legacyDashboardScopeFromSession,
} from "@/lib/sales-dashboard/dashboard-cache";
import { ExecutiveDashboardView } from "@/components/dashboard/executive-dashboard-view";
import { ManagerDashboardView } from "@/components/dashboard/manager-dashboard-view";
import { LegacyRoleDashboard } from "@/components/dashboard/legacy-role-dashboard";

type PageProps = {
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

function isSalesExecutiveOnly(roles: string[]): boolean {
  return roles.includes(ROLES.SALES_EXECUTIVE) && !canViewTeamSalesDashboard(roles);
}

function parseTrendMetric(
  value: string | undefined,
): "modules" | "dispatch" | "collection" | "pi" {
  return value === "dispatch" ||
    value === "collection" ||
    value === "pi" ||
    value === "modules"
    ? value
    : "modules";
}

function resolveCompanyLabel(session: Session) {
  const ops = operationalCompanies(session.user.companies ?? []);
  if (isAllCompaniesScope(session.user.activeCompanyId) && ops.length > 1) {
    return formatAllCompaniesLabel(ops);
  }
  const activeCompany = (session.user.companies ?? []).find(
    (company) => company.id === session.user.activeCompanyId,
  );
  return activeCompany
    ? `${activeCompany.name} (${activeCompany.code})`
    : undefined;
}

async function renderLegacyDashboard(session: Session) {
  const data = await getCachedLegacyDashboard(legacyDashboardScopeFromSession(session));
  return <LegacyRoleDashboard data={data} />;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const roles = session.user.roles ?? [];

  if (!canViewSalesDashboard(roles)) {
    return await renderLegacyDashboard(session);
  }

  let scope;
  try {
    scope = resolveSalesDashboardScope(session);
  } catch (error) {
    if (error instanceof SalesDashboardAccessError) {
      return await renderLegacyDashboard(session);
    }
    throw error;
  }

  const period = VALID_PERIODS.has(params.period as DashboardPeriod)
    ? (params.period as DashboardPeriod)
    : "month";

  const query = {
    period,
    fromDate: params.fromDate,
    toDate: params.toDate,
    trendMetric: parseTrendMetric(params.trendMetric),
  };

  const companyLabel = resolveCompanyLabel(session);
  const allCompanies = isAllCompaniesScope(session.user.activeCompanyId);

  if (scope.canViewTeam && !scope.restrictToUserId) {
    try {
      const dashboard = await getCachedManagerDashboard(scope, query, allCompanies);
      return (
        <ManagerDashboardView
          data={dashboard}
          userName={session.user.name ?? "there"}
          companyLabel={companyLabel}
        />
      );
    } catch (error) {
      console.error("[dashboard] manager dashboard failed", error);
      return await renderLegacyDashboard(session);
    }
  }

  if (isSalesExecutiveOnly(roles)) {
    try {
      const dashboard = await getCachedExecutiveDashboard(scope, query, allCompanies);
      return (
        <ExecutiveDashboardView
          data={dashboard}
          userName={session.user.name ?? "there"}
          salesUserId={scope.userId}
          companyLabel={companyLabel}
        />
      );
    } catch (error) {
      console.error("[dashboard] executive dashboard failed", error);
      return await renderLegacyDashboard(session);
    }
  }

  return await renderLegacyDashboard(session);
}
