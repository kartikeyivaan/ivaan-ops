import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { getBusinessMonthRange } from "@/lib/business-dates";
import {
  ModuleMasteryError,
  canRecalculateModuleMastery,
  recalculateAllExecutivesForMonth,
  recalculateExecutiveModuleMastery,
} from "@/lib/module-mastery-service";
import { resolveRestrictToUserId } from "@/lib/sales-dashboard/dashboard-permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

const allSchema = z.object({
  all: z.literal(true),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

const singleSchema = z.object({
  executiveId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("AUTH_REQUIRED", "Please login to continue.", 401);
  }
  if (!canRecalculateModuleMastery(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You cannot recalculate Module Mastery.", 403);
  }

  const companyId = requireActiveCompany(session);
  const json = await request.json().catch(() => null);
  const restrictToUserId = resolveRestrictToUserId(session.user.roles, session.user.id);
  const current = getBusinessMonthRange();

  try {
    const allParsed = allSchema.safeParse(json);
    if (allParsed.success) {
      if (restrictToUserId) {
        return errorResponse("FORBIDDEN", "Executives cannot recalculate the full team.", 403);
      }
      const year = allParsed.data.year ?? current.year;
      const month = allParsed.data.month ?? current.month;
      const results = await recalculateAllExecutivesForMonth(prisma, companyId, year, month);
      return NextResponse.json({
        recalculated: results.length,
        year,
        month,
      });
    }

    const singleParsed = singleSchema.safeParse(json);
    if (!singleParsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid recalculate payload.", 400);
    }

    const { executiveId, year, month } = singleParsed.data;
    if (restrictToUserId && restrictToUserId !== executiveId) {
      return errorResponse("FORBIDDEN", "You can only recalculate your own progress.", 403);
    }

    const result = await recalculateExecutiveModuleMastery(prisma, {
      companyId,
      executiveId,
      year,
      month,
    });

    return NextResponse.json({
      progress: result.progress,
      mastery: result.result,
    });
  } catch (error) {
    if (error instanceof ModuleMasteryError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return errorResponse(error.code, error.message, status);
    }
    throw error;
  }
}
