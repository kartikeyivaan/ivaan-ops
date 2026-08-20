import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import {
  resolveSalesDashboardScope,
  SalesDashboardAccessError,
} from "@/lib/sales-dashboard/dashboard-api";
import {
  canViewExecutivePerformanceDetail,
} from "@/lib/sales-dashboard/dashboard-permissions";
import {
  ModuleMasteryError,
  getExecutiveModuleMastery,
} from "@/lib/module-mastery-service";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function resolveExecutiveId(
  scope: ReturnType<typeof resolveSalesDashboardScope>,
  requested?: string | null,
): string | null {
  if (scope.restrictToUserId) return scope.restrictToUserId;
  if (!requested) return scope.userId;
  if (
    canViewExecutivePerformanceDetail(
      scope.roles,
      scope.userId,
      requested,
    )
  ) {
    return requested;
  }
  return null;
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
  const executiveId = resolveExecutiveId(scope, searchParams.get("executiveId"));
  if (!executiveId) {
    return errorResponse("FORBIDDEN", "You cannot view this executive's mastery.", 403);
  }

  const companyId = requireActiveCompany(session);

  try {
    const mastery = await getExecutiveModuleMastery(prisma, companyId, executiveId);
    return NextResponse.json(mastery);
  } catch (error) {
    if (error instanceof ModuleMasteryError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return errorResponse(error.code, error.message, status);
    }
    throw error;
  }
}
