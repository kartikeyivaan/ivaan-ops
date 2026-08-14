import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectError, projectErrorResponse } from "@/lib/project-api";
import { approveProjectMaterialAssignment } from "@/lib/project-material-service";
import { canEditProjectMaterial } from "@/lib/project-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { approveProjectProposalSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canEditProjectMaterial(session.user.roles)) {
    return projectErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = approveProjectProposalSchema.safeParse(body);

  try {
    const project = await approveProjectMaterialAssignment(prisma, {
      companyId,
      projectId: id,
      performedById: session.user.id,
      performedByName: session.user.name ?? "User",
      userRoles: session.user.roles,
      remarks: parsed.success ? parsed.data.remarks : undefined,
    });
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}
