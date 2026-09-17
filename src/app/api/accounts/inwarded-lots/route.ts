import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewInwardedLots } from "@/lib/accounts-permissions";
import { listIncomingLots, serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { inwardedLotsSearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

function startOfUtcDay(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfUtcDay(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewInwardedLots(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const parsed = inwardedLotsSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
    includeInternalTransfers: searchParams.get("includeInternalTransfers") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const result = await listIncomingLots(prisma, companyId, {
    q: parsed.data.q,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    inwardedOnly: true,
    excludeInternalTransfers: !parsed.data.includeInternalTransfers,
    receivedFrom: startOfUtcDay(parsed.data.dateFrom || undefined),
    receivedTo: endOfUtcDay(parsed.data.dateTo || undefined),
  });

  return NextResponse.json({
    ...result,
    items: result.items.map((lot) => serializeLotForRole(lot, false)),
  });
}
