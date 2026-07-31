import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageDispatches } from "@/lib/dispatch-permissions";
import { lookupSerialsForDispatch } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { lookupDispatchSerialsSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = lookupDispatchSerialsSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid serial lookup payload.", 400, parsed.error.flatten());
  }

  try {
    const result = await lookupSerialsForDispatch(prisma, {
      companyId,
      piId: parsed.data.piId,
      productId: parsed.data.productId,
      serialNumbers: parsed.data.serialNumbers,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
    }
    throw error;
  }
}
