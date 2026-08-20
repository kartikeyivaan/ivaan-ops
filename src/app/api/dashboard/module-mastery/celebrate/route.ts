import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import {
  resolveSalesDashboardScope,
  SalesDashboardAccessError,
} from "@/lib/sales-dashboard/dashboard-api";
import {
  ModuleMasteryError,
  acknowledgeAllPendingCelebrations,
} from "@/lib/module-mastery-service";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(request: Request) {
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

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid celebration payload.", 400);
  }

  const companyId = requireActiveCompany(session);
  const executiveId = scope.restrictToUserId ?? scope.userId;

  try {
    const result = await acknowledgeAllPendingCelebrations(prisma, {
      companyId,
      executiveId,
      year: parsed.data.year,
      month: parsed.data.month,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ModuleMasteryError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return errorResponse(error.code, error.message, status);
    }
    throw error;
  }
}
