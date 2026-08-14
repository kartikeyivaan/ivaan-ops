import { NextResponse } from "next/server";
import { ProjectStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { projectErrorResponse } from "@/lib/project-api";
import { canViewExecutionProjects } from "@/lib/project-permissions";
import { listProjects } from "@/lib/project-service";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";
import { projectSearchSchema } from "@/lib/validations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewExecutionProjects(session.user.roles)) {
    return projectErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireProjectsCompany(session);
  } catch (error) {
    const mapped = mapProjectsCompanySessionError(error);
    if (mapped) {
      return projectErrorResponse(mapped.code, mapped.message, mapped.status);
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const parsed = projectSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return projectErrorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const projects = await listProjects(prisma, companyId, {
    q: parsed.data.q,
    status: parsed.data.status as ProjectStatus | undefined,
  });

  return NextResponse.json(projects);
}
