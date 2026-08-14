import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectError, projectErrorResponse } from "@/lib/project-api";
import { canViewExecutionProjects } from "@/lib/project-permissions";
import { getProjectById } from "@/lib/project-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewExecutionProjects(session.user.roles)) {
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
    const project = await getProjectById(prisma, companyId, id);
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}
