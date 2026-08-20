import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import {
  resolveSalesDashboardScope,
  SalesDashboardAccessError,
} from "@/lib/sales-dashboard/dashboard-api";
import { canViewExecutivePerformanceDetail } from "@/lib/sales-dashboard/dashboard-permissions";
import {
  ModuleMasteryError,
  getExecutiveModuleJourney,
} from "@/lib/module-mastery-service";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("AUTH_REQUIRED", "Please login to continue.", 401);
  }

  let scope;
  try {
    scope = resolveSalesDashboardScope(session);
  } catch (error) {
    if (error instanceof SalesDashboardAccessError) {
      return errorResponse(error.code, error.message, 403);
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("executiveId");
  const executiveId = scope.restrictToUserId
    ? scope.restrictToUserId
    : requested &&
        canViewExecutivePerformanceDetail(scope.roles, scope.userId, requested)
      ? requested
      : scope.userId;

  if (
    requested &&
    !scope.restrictToUserId &&
    executiveId !== requested
  ) {
    return errorResponse("FORBIDDEN", "You cannot view this executive's journey.", 403);
  }

  const companyId = requireActiveCompany(session);

  try {
    const journey = await getExecutiveModuleJourney(prisma, companyId, executiveId);
    return NextResponse.json(journey);
  } catch (error) {
    if (error instanceof ModuleMasteryError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return errorResponse(error.code, error.message, status);
    }
    throw error;
  }
}
