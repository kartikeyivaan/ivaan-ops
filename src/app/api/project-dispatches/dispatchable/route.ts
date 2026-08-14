import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewProjectDispatches } from "@/lib/project-permissions";
import { listDispatchableProjects } from "@/lib/project-dispatch-service";
import { projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewProjectDispatches(session.user.roles)) {
    return projectDispatchErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectDispatchErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;

  const rows = await listDispatchableProjects(prisma, companyId, { q });
  return NextResponse.json(rows);
}
