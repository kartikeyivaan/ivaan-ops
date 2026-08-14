import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageProjectDispatches } from "@/lib/project-permissions";
import { lookupSerialsForProjectDispatch } from "@/lib/project-dispatch-service";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { lookupProjectDispatchSerialsSchema } from "@/lib/validations";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageProjectDispatches(session.user.roles)) {
    return projectDispatchErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectDispatchErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = lookupProjectDispatchSerialsSchema.safeParse(body);
  if (!parsed.success) {
    return projectDispatchErrorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid serial lookup payload.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const result = await lookupSerialsForProjectDispatch(prisma, {
      companyId,
      projectId: parsed.data.projectId,
      productId: parsed.data.productId,
      serialNumbers: parsed.data.serialNumbers,
    });
    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}
