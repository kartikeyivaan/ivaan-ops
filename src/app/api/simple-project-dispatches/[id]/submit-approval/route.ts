import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { canPrepareSimpleProjectDispatch } from "@/lib/project-permissions";
import { submitSimpleProjectDispatchForApproval } from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canPrepareSimpleProjectDispatch(session.user.roles)) {
    return projectDispatchErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
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
    const dispatch = await submitSimpleProjectDispatchForApproval(prisma, {
      companyId,
      dispatchId: id,
      performedById: session.user.id,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}
