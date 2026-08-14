import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import { canManageProjectDispatches } from "@/lib/project-permissions";
import { confirmProjectDispatch } from "@/lib/project-dispatch-service";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProjectDispatches(session.user.roles)) {
    return projectDispatchErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectDispatchErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;

  try {
    await assertInventoryOpsAllowed(prisma, companyId);

    const dispatch = await confirmProjectDispatch(prisma, {
      companyId,
      dispatchId: id,
      performedById: session.user.id,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return projectDispatchErrorResponse(
        "TRANSACTION_TIMEOUT",
        "Dispatch took too long to confirm. Please retry.",
        504,
      );
    }
    throw error;
  }
}
