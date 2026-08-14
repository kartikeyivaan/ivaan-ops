import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageProjectDispatches } from "@/lib/project-permissions";
import { lookupSerialForProjectDispatch } from "@/lib/project-dispatch-service";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const serialNumber = searchParams.get("serialNumber");
  const productId = searchParams.get("productId") ?? undefined;
  if (!projectId || !serialNumber) {
    return projectDispatchErrorResponse(
      "VALIDATION_ERROR",
      "projectId and serialNumber are required.",
      400,
    );
  }

  try {
    const serial = await lookupSerialForProjectDispatch(prisma, {
      companyId,
      projectId,
      serialNumber,
      productId,
    });
    return NextResponse.json(serial);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}
