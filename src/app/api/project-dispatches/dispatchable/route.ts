import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewProjectDispatches } from "@/lib/project-permissions";
import { listDispatchableProjects } from "@/lib/project-dispatch-service";
import { projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewProjectDispatches(session.user.roles)) {
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

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;

  const rows = await listDispatchableProjects(prisma, companyId, { q });
  return NextResponse.json(rows);
}
