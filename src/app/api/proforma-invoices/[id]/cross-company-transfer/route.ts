import { NextResponse } from "next/server";
import { PiCrossCompanyTransferPlanStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  createOrReplaceCrossCompanyPlan,
  prepareDispatchTodayCrossCompany,
  requestCrossCompanyPlanApproval,
} from "@/lib/cross-company-transfer-service";
import { canMarkDispatchToday } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  fromCompanyId: z.string().uuid(),
});

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/** Request re-approval when warehouse needs a different source company than approved. */
export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canMarkDispatchToday(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, parsed.error.flatten());
  }

  const pi = await prisma.proformaInvoice.findFirst({
    where: { id, companyId },
    select: { id: true, piNo: true },
  });
  if (!pi) return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);

  try {
    const prepared = await prepareDispatchTodayCrossCompany(prisma, {
      companyId,
      piId: pi.id,
      fromCompanyId: parsed.data.fromCompanyId,
    });
    if (!prepared.needsPlan) {
      return errorResponse(
        "NO_SHORTFALL",
        "No cross-company shortfall is required for this PI.",
        400,
      );
    }

    const fromCompany = await prisma.company.findUniqueOrThrow({
      where: { id: prepared.fromCompanyId },
      select: { code: true },
    });

    const plan = await prisma.$transaction(async (tx) => {
      const created = await createOrReplaceCrossCompanyPlan(tx, {
        piId: pi.id,
        toCompanyId: companyId,
        fromCompanyId: prepared.fromCompanyId,
        shortfallLines: prepared.shortfallLines,
        requestedById: session.user!.id,
        status: PiCrossCompanyTransferPlanStatus.PENDING,
      });
      await requestCrossCompanyPlanApproval(tx, {
        planId: created.id,
        piNo: pi.piNo,
        companyId,
        requestedById: session.user!.id,
        fromCompanyCode: fromCompany.code,
      });
      return created;
    });

    return NextResponse.json({
      id: plan.id,
      status: plan.status,
      fromCompany: plan.fromCompany,
      pendingApproval: true,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "STOCK_UNAVAILABLE") {
        return errorResponse(
          "STOCK_UNAVAILABLE",
          "Stock is not available in any company for the remaining PI quantity.",
          400,
        );
      }
      if (error.message === "SOURCE_INSUFFICIENT_STOCK") {
        return errorResponse(
          "SOURCE_INSUFFICIENT_STOCK",
          "Selected company does not have enough available stock for the shortfall.",
          400,
        );
      }
    }
    throw error;
  }
}
