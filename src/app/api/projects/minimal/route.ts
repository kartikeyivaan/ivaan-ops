import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getActiveSessionCompany,
  mapProjectsCompanySessionError,
  requireProjectsCompany,
} from "@/lib/company-scope";
import { projectDispatchErrorResponse, mapProjectDispatchError } from "@/lib/project-dispatch-api";
import { canCreateMinimalProject, canPrepareSimpleProjectDispatch } from "@/lib/project-permissions";
import {
  createMinimalProject,
  findProjectByProjectNo,
} from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";
import { createMinimalProjectSchema } from "@/lib/validations";

/** GET ?projectNo= — lookup project by physical register number (ISE). */
export async function GET(request: Request) {
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

  const projectNo = new URL(request.url).searchParams.get("projectNo") ?? "";
  if (!projectNo.trim()) {
    return projectDispatchErrorResponse("PROJECT_NO_REQUIRED", "Project number is required.", 400);
  }

  try {
    const project = await findProjectByProjectNo(prisma, companyId, projectNo);
    if (!project) {
      return projectDispatchErrorResponse("NOT_FOUND", "Project not found.", 404);
    }
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST — create minimal project (Customer name + Project Number). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canCreateMinimalProject(session.user.roles)) {
    return projectDispatchErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  let companyCode: string;
  try {
    companyId = requireProjectsCompany(session);
    const company = getActiveSessionCompany(session);
    if (!company?.code) {
      return projectDispatchErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
    }
    companyCode = company.code;
  } catch (error) {
    const mapped = mapProjectsCompanySessionError(error);
    if (mapped) {
      return projectDispatchErrorResponse(mapped.code, mapped.message, mapped.status);
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = createMinimalProjectSchema.safeParse(body);
  if (!parsed.success) {
    return projectDispatchErrorResponse(
      "VALIDATION_ERROR",
      "Invalid project details.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const project = await createMinimalProject(prisma, {
      companyId,
      companyCode,
      projectNo: parsed.data.projectNo,
      customerName: parsed.data.customerName,
      createdById: session.user.id,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}
