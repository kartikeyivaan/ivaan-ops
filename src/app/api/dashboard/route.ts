import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  resolveSalesDashboardScope,
  SalesDashboardAccessError,
} from "@/lib/sales-dashboard/dashboard-api";
import {
  getSalesDashboard,
  type SalesDashboardQuery,
} from "@/lib/sales-dashboard/dashboard-service";
import type { DashboardPeriod } from "@/lib/business-dates";

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
  const period = (searchParams.get("period") ?? "month") as DashboardPeriod;
  const query: SalesDashboardQuery = {
    period,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
    trendMetric:
      (searchParams.get("trendMetric") as SalesDashboardQuery["trendMetric"]) ??
      "modules",
  };

  const dashboard = await getSalesDashboard(prisma, scope, query);
  return NextResponse.json(dashboard);
}
