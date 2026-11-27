import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setManualEntryBlocked, isManualEntryBlocked } from "@/lib/manual-payment-service";
import { canDecideManualPayments } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse("UNAUTHORIZED", "Sign in required.", 401);

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  return NextResponse.json({
    manualEntryBlocked: await isManualEntryBlocked(prisma, companyId),
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user || !canDecideManualPayments(session.user.roles)) {
    return errorResponse("FORBIDDEN", "Only Accounts can change manual payment entry.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = (await request.json().catch(() => null)) as { manualEntryBlocked?: unknown } | null;
  if (!body || typeof body.manualEntryBlocked !== "boolean") {
    return errorResponse("VALIDATION_ERROR", "manualEntryBlocked must be true or false.", 400);
  }

  const row = await setManualEntryBlocked(prisma, {
    companyId,
    blocked: body.manualEntryBlocked,
    updatedById: session.user.id,
  });
  return NextResponse.json({ manualEntryBlocked: row.manualEntryBlocked });
}
