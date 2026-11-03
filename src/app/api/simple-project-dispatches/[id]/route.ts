import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { mapProjectDispatchError, projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import {
  canPrepareSimpleProjectDispatch,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import {
  getSimpleProjectDispatch,
  updateSimpleProjectDispatchDraft,
} from "@/lib/simple-project-dispatch-service";
import { prisma } from "@/lib/prisma";
import { updateSimpleProjectDispatchSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  try {
    const dispatch = await getSimpleProjectDispatch(prisma, companyId, id);
    return NextResponse.json(dispatch);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSimpleProjectDispatchSchema.safeParse(body);
  if (!parsed.success) {
    return projectDispatchErrorResponse(
      "VALIDATION_ERROR",
      "Invalid dispatch payload.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const dispatch = await updateSimpleProjectDispatchDraft(prisma, {
      companyId,
      dispatchId: id,
      performedById: session.user.id,
      receiverName: parsed.data.receiverName,
      remarks: parsed.data.remarks,
      serials: parsed.data.serials,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    const mapped = mapProjectDispatchError(error);
    if (mapped) return mapped;
    throw error;
  }
}
