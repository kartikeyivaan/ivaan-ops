import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/rbac";
import { requireActiveCompany } from "@/lib/session";
import {
  resolveSalesDashboardScope,
  SalesDashboardAccessError,
} from "@/lib/sales-dashboard/dashboard-api";
import {
  canViewExecutivePerformanceDetail,
  canViewTeamSalesDashboard,
} from "@/lib/sales-dashboard/dashboard-permissions";
import { getExecutiveModuleJourney } from "@/lib/module-mastery-service";
import { ModuleMasteryJourneyView } from "@/components/dashboard/module-mastery-journey-view";

type PageProps = {
  searchParams: Promise<{ executiveId?: string }>;
};

function canAccessJourney(roles: string[]): boolean {
  return (
    roles.includes(ROLES.SALES_EXECUTIVE) ||
    canViewTeamSalesDashboard(roles)
  );
}

export default async function ModuleMasteryJourneyPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const roles = session.user.roles ?? [];
  if (!canAccessJourney(roles)) redirect("/dashboard");

  let scope;
  try {
    scope = resolveSalesDashboardScope(session);
  } catch (error) {
    if (error instanceof SalesDashboardAccessError) redirect("/dashboard");
    throw error;
  }

  const params = await searchParams;
  const companyId = requireActiveCompany(session);

  let executiveId = scope.restrictToUserId ?? scope.userId;
  if (params.executiveId && !scope.restrictToUserId) {
    if (
      canViewExecutivePerformanceDetail(
        scope.roles,
        scope.userId,
        params.executiveId,
      )
    ) {
      executiveId = params.executiveId;
    }
  }

  const journey = await getExecutiveModuleJourney(prisma, companyId, executiveId);

  return <ModuleMasteryJourneyView journey={journey} />;
}
