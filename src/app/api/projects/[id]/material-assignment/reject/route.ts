import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectError, projectErrorResponse } from "@/lib/project-api";
import { rejectProjectMaterialAssignment } from "@/lib/project-material-service";
import { canEditProjectMaterial } from "@/lib/project-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { rejectProjectProposalSchema } from "@/lib/validations";

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
  const body = await request.json();
  const parsed = rejectProjectProposalSchema.safeParse(body);
  if (!parsed.success) {
    return projectErrorResponse("VALIDATION_ERROR", "A rejection reason is required.", 400);
  }

  try {
    const project = await rejectProjectMaterialAssignment(prisma, {
      companyId,
      projectId: id,
      performedById: session.user.id,
      userRoles: session.user.roles,
      reason: parsed.data.reason,
    });
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}
