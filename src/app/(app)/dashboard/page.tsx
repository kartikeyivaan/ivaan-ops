import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { ROLES } from "@/lib/rbac";

import { prisma } from "@/lib/prisma";

import type { DashboardPeriod } from "@/lib/business-dates";

import {

  resolveSalesDashboardScope,

  SalesDashboardAccessError,

} from "@/lib/sales-dashboard/dashboard-api";

import {

  canViewSalesDashboard,

  canViewTeamSalesDashboard,

} from "@/lib/sales-dashboard/dashboard-permissions";

import {

  getExecutiveDashboard,

  getManagerDashboard,

} from "@/lib/sales-dashboard/dashboard-service";

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



export default async function DashboardPage({ searchParams }: PageProps) {

  const session = await auth();

  if (!session?.user) {

    redirect("/login");

  }



  const params = await searchParams;

  const roles = session.user.roles ?? [];



  if (!canViewSalesDashboard(roles)) {

    return <LegacyRoleDashboard session={session} />;

  }



  let scope;

  try {

    scope = resolveSalesDashboardScope(session);

  } catch (error) {

    if (error instanceof SalesDashboardAccessError) {

      return <LegacyRoleDashboard session={session} />;

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



  const activeCompany = session.user.companies.find(

    (company) => company.id === session.user.activeCompanyId,

  );

  const companyLabel = activeCompany

    ? `${activeCompany.name} (${activeCompany.code})`

    : undefined;



  if (scope.canViewTeam && !scope.restrictToUserId) {

    const dashboard = await getManagerDashboard(prisma, scope, query);

    return (

      <ManagerDashboardView

        data={dashboard}

        userName={session.user.name ?? "there"}

        companyLabel={companyLabel}

      />

    );

  }



  if (isSalesExecutiveOnly(roles)) {

    const dashboard = await getExecutiveDashboard(prisma, scope, query);

    return (

      <ExecutiveDashboardView

        data={dashboard}

        userName={session.user.name ?? "there"}

        salesUserId={scope.userId}

        companyLabel={companyLabel}

      />

    );

  }



  return <LegacyRoleDashboard session={session} />;

}

