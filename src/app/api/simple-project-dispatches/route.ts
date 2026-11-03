import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import {
  canPrepareSimpleProjectDispatch,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import {
  createSimpleProjectDispatch,
  listSimpleProjectDispatches,
} from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";
import {
  createSimpleProjectDispatchSchema,
  simpleProjectDispatchSearchSchema,
} from "@/lib/validations";

export async function GET(request: Request) {
  const session = await auth();
  if (
    !session?.user ||
    (!canViewProjectDispatches(session.user.roles) &&
      !canPrepareSimpleProjectDispatch(session.user.roles))
  ) {
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
  const parsed = simpleProjectDispatchSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
  });
  if (!parsed.success) {
    return projectDispatchErrorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const rows = await listSimpleProjectDispatches(prisma, companyId, parsed.data);
  return NextResponse.json(rows);
}

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
  const parsed = createSimpleProjectDispatchSchema.safeParse(body);
  if (!parsed.success) {
    return projectDispatchErrorResponse(
      "VALIDATION_ERROR",
      "Invalid dispatch payload.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const dispatch = await createSimpleProjectDispatch(prisma, {
      companyId,
      projectId: parsed.data.projectId,
      createdById: session.user.id,
      receiverName: parsed.data.receiverName,
      remarks: parsed.data.remarks,
      serials: parsed.data.serials,
    });
    return NextResponse.json(dispatch, { status: 201 });
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}
