import { NextResponse } from "next/server";
import { SalesModuleTargetScope } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { listSalesExecutivesForCompany } from "@/lib/report-builders";
import {
  SalesTargetError,
  canManageSalesTargets,
  deleteSalesModuleTarget,
  listSalesTargetsForAdmin,
  upsertCompanyDefaultTarget,
  upsertExecutiveDefaultTarget,
  upsertMonthlyOverrideTarget,
} from "@/lib/sales-target-service";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

const upsertSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(SalesModuleTargetScope.COMPANY_DEFAULT),
    targetModules: z.number().int().positive(),
  }),
  z.object({
    scope: z.literal(SalesModuleTargetScope.EXECUTIVE_DEFAULT),
    executiveId: z.string().uuid(),
    targetModules: z.number().int().positive(),
  }),
  z.object({
    scope: z.literal(SalesModuleTargetScope.MONTHLY_OVERRIDE),
    executiveId: z.string().uuid(),
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    targetModules: z.number().int().positive(),
  }),
]);

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("AUTH_REQUIRED", "Please login to continue.", 401);
  }
  if (!canManageSalesTargets(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You cannot manage sales targets.", 403);
  }

  const companyId = requireActiveCompany(session);
  const [targets, executives] = await Promise.all([
    listSalesTargetsForAdmin(prisma, companyId, session.user.id),
    listSalesExecutivesForCompany(prisma, companyId),
  ]);

  return NextResponse.json({ targets, executives });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("AUTH_REQUIRED", "Please login to continue.", 401);
  }
  if (!canManageSalesTargets(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You cannot manage sales targets.", 403);
  }

  const companyId = requireActiveCompany(session);
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid target payload.", 400);
  }

  try {
    const input = parsed.data;
    let row;
    if (input.scope === SalesModuleTargetScope.COMPANY_DEFAULT) {
      row = await upsertCompanyDefaultTarget(
        prisma,
        companyId,
        input.targetModules,
        session.user.id,
      );
    } else if (input.scope === SalesModuleTargetScope.EXECUTIVE_DEFAULT) {
      row = await upsertExecutiveDefaultTarget(
        prisma,
        companyId,
        input.executiveId,
        input.targetModules,
        session.user.id,
      );
    } else {
      row = await upsertMonthlyOverrideTarget(
        prisma,
        companyId,
        input.executiveId,
        input.year,
        input.month,
        input.targetModules,
        session.user.id,
      );
    }
    return NextResponse.json({ target: row });
  } catch (error) {
    if (error instanceof SalesTargetError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return errorResponse(error.code, error.message, status);
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("AUTH_REQUIRED", "Please login to continue.", 401);
  }
  if (!canManageSalesTargets(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You cannot manage sales targets.", 403);
  }

  const companyId = requireActiveCompany(session);
  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("id");
  if (!targetId) {
    return errorResponse("VALIDATION_ERROR", "Target id is required.", 400);
  }

  try {
    await deleteSalesModuleTarget(prisma, companyId, targetId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SalesTargetError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return errorResponse(error.code, error.message, status);
    }
    throw error;
  }
}
