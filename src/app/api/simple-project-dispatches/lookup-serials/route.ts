import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { canPrepareSimpleProjectDispatch } from "@/lib/project-permissions";
import { lookupSerialsForSimpleProjectDispatch } from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";
import { lookupSimpleProjectDispatchSerialsSchema } from "@/lib/validations";

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  const parsed = lookupSimpleProjectDispatchSerialsSchema.safeParse(body);
  if (!parsed.success) {
    return projectDispatchErrorResponse(
      "VALIDATION_ERROR",
      "Invalid serial lookup payload.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const result = await lookupSerialsForSimpleProjectDispatch(prisma, {
      companyId,
      projectId: parsed.data.projectId,
      serialNumbers: parsed.data.serialNumbers,
    });
    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}
