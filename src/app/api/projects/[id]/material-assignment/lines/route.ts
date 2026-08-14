import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectError, projectErrorResponse } from "@/lib/project-api";
import { addMaterialLine } from "@/lib/project-material-service";
import { canEditProjectMaterial } from "@/lib/project-permissions";
import { serializeProject } from "@/lib/project-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { addProjectMaterialLineSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
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

  try {
    const { loadProjectOrThrow } = await import("@/lib/project-service");
    const project = await loadProjectOrThrow(prisma, companyId, id);
    return NextResponse.json(serializeProject(project));
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}

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
  const parsed = addProjectMaterialLineSchema.safeParse(body);
  if (!parsed.success) {
    return projectErrorResponse(
      "VALIDATION_ERROR",
      "Invalid line data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const project = await addMaterialLine(prisma, {
      companyId,
      projectId: id,
      productId: parsed.data.productId,
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
