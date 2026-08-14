import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import { canCloseProject } from "@/lib/project-permissions";
import { mapProjectError, projectErrorResponse } from "@/lib/project-api";
import { closeProject } from "@/lib/project-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canCloseProject(session.user.roles)) {
    return projectErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;

  try {
    await assertInventoryOpsAllowed(prisma, companyId);

    const project = await closeProject(prisma, {
      companyId,
      projectId: id,
      performedById: session.user.id,
    });
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}
