import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditService, canViewService } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { getServiceRequestById, updateServiceRequest } from "@/lib/service-service";
import { updateServiceRequestSchema } from "@/lib/service-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const record = await getServiceRequestById(prisma, access.companyId, id);
  if (!record) return serviceError("NOT_FOUND", "Service request not found.", 404);

  // Executives may only view requests assigned to them.
  if (access.restrictToUserId && record.assignedToUserId !== access.restrictToUserId) {
    return serviceError("FORBIDDEN", "You do not have access to this request.", 403);
  }

  return NextResponse.json(record);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canEditService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateServiceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  try {
    const updated = await updateServiceRequest(prisma, {
      ...parsed.data,
      companyId: access.companyId,
      id,
      performedByUserId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapServiceError(error);
  }
}
