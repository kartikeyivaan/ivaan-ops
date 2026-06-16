import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewDispatches } from "@/lib/dispatch-permissions";
import { getDispatchById } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const dispatch = await getDispatchById(prisma, companyId, id);
  if (!dispatch) {
    return errorResponse("NOT_FOUND", "Dispatch not found.", 404);
  }

  return NextResponse.json(dispatch);
}
