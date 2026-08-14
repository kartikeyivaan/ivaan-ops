import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectError, projectErrorResponse } from "@/lib/project-api";
import { deleteMaterialLine, updateMaterialLine } from "@/lib/project-material-service";
import { canEditProjectMaterial } from "@/lib/project-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { updateProjectMaterialLineSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string; lineId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
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

  const { id, lineId } = await context.params;
  const body = await request.json();
  const parsed = updateProjectMaterialLineSchema.safeParse(body);
  if (!parsed.success) {
    return projectErrorResponse(
      "VALIDATION_ERROR",
      "Invalid line data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const project = await updateMaterialLine(prisma, {
      companyId,
      projectId: id,
      lineId,
      requiredQty: parsed.data.requiredQty,
      remarks: parsed.data.remarks,
      performedById: session.user.id,
    });
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

  const { id, lineId } = await context.params;

  try {
    const project = await deleteMaterialLine(prisma, {
      companyId,
      projectId: id,
      lineId,
      performedById: session.user.id,
    });
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}
