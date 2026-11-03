import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { canConfirmSimpleProjectDispatch } from "@/lib/project-permissions";
import { confirmSimpleProjectDispatch } from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canConfirmSimpleProjectDispatch(session.user.roles)) {
    return projectDispatchErrorResponse(
      "FORBIDDEN",
      "Only Projects Manager or Super Admin can confirm project dispatch.",
      403,
    );
  }

  let companyId: string;
  try {
    companyId = requireProjectsCompany(session);
  } catch (error) {
    const mapped = mapProjectsCompanySessionError(error);
    if (mapped) {
      return projectDispatchErrorResponse(mapped.code, mapped.message, mapped.status);
    }
    throw error;
  }

  const { id } = await context.params;

  try {
    await assertInventoryOpsAllowed(prisma, companyId);
    const dispatch = await confirmSimpleProjectDispatch(prisma, {
      companyId,
      dispatchId: id,
      performedById: session.user.id,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
      return projectDispatchErrorResponse(
        "TRANSACTION_TIMEOUT",
        "Dispatch took too long to confirm. Please retry.",
        504,
      );
    }
    throw error;
  }
}
