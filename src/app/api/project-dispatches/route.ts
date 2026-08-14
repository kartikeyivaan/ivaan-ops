import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import {
  canManageProjectDispatches,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import {
  createProjectDispatch,
  listProjectDispatches,
} from "@/lib/project-dispatch-service";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";
import {
  createProjectDispatchSchema,
  projectDispatchSearchSchema,
} from "@/lib/validations";

export const maxDuration = 60;

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
  const parsed = projectDispatchSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return projectDispatchErrorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const rows = await listProjectDispatches(prisma, companyId, parsed.data);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageProjectDispatches(session.user.roles)) {
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

  const body = await request.json();
  const parsed = createProjectDispatchSchema.safeParse(body);
  if (!parsed.success) {
    return projectDispatchErrorResponse(
      "VALIDATION_ERROR",
      "Invalid project dispatch data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    await assertInventoryOpsAllowed(prisma, companyId);

    const dispatch = await createProjectDispatch(prisma, {
      companyId,
      projectId: parsed.data.projectId,
      createdById: session.user.id,
      vehicleNo: parsed.data.vehicleNo,
      receiverName: parsed.data.receiverName,
      receiverMobile: parsed.data.receiverMobile,
      signatureData: parsed.data.signatureData || undefined,
      remarks: parsed.data.remarks,
      confirm: parsed.data.confirm,
      lines: parsed.data.lines,
    });
    return NextResponse.json(dispatch, { status: 201 });
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return projectDispatchErrorResponse(
        "TRANSACTION_TIMEOUT",
        "Dispatch took too long to confirm. Please retry.",
        504,
      );
    }
    throw error;
  }
}
