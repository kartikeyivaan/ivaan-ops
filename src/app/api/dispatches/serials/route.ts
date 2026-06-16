import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canManageDispatches,
  canViewDispatchSerials,
} from "@/lib/dispatch-permissions";
import { listBookedSerialsForPi } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const piId = searchParams.get("piId");
  const productId = searchParams.get("productId");
  if (!piId || !productId) {
    return errorResponse("VALIDATION_ERROR", "piId and productId are required.", 400);
  }

  if (!canViewDispatchSerials(session.user.roles)) {
    return NextResponse.json([]);
  }

  try {
    const serials = await listBookedSerialsForPi(prisma, {
      companyId,
      piId,
      productId,
    });
    return NextResponse.json(serials);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
    }
    throw error;
  }
}
