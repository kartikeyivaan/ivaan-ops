import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeDispatchTodayStockCheck } from "@/lib/cross-company-transfer-service";
import {
  resolveDispatchTodayPlannedQtyMap,
  type DispatchTodayPlannedLineInput,
} from "@/lib/dispatch-today-planned-qty";
import { canMarkDispatchToday } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { dispatchTodayPlannedLineSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";
import { z } from "zod";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

const stockCheckBodySchema = z.object({
  lines: z.array(dispatchTodayPlannedLineSchema).optional(),
});

async function runStockCheck(
  companyId: string,
  piId: string,
  plannedLines?: DispatchTodayPlannedLineInput[],
) {
  const pi = await prisma.proformaInvoice.findFirst({
    where: { id: piId, companyId },
    include: {
      items: { include: { product: { include: { category: true } } } },
    },
  });
  if (!pi) return null;

  let plannedQtyByItemId: Map<string, number> | undefined;
  if (plannedLines?.length) {
    plannedQtyByItemId = resolveDispatchTodayPlannedQtyMap(pi.items, plannedLines);
  }

  return computeDispatchTodayStockCheck(prisma, {
    companyId,
    piId,
    plannedQtyByItemId,
  });
}

export async function GET(_request: Request, context: RouteContext) {
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
  const check = await runStockCheck(companyId, id);
  if (!check) return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
  return NextResponse.json(check);
}

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
  const parsed = stockCheckBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid stock check payload.", 400);
  }

  try {
    const check = await runStockCheck(companyId, id, parsed.data.lines);
    if (!check) return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
    return NextResponse.json(check);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PLANNED_QTY") {
      return errorResponse(
        "INVALID_PLANNED_QTY",
        "Dispatch quantity must be between 0 and the remaining booked quantity for each line.",
        400,
      );
    }
    throw error;
  }
}
