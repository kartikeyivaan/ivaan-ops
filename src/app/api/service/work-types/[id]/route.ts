import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageServiceWorkTypes } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { updateServiceWorkType } from "@/lib/service-service";
import { serviceWorkTypeUpdateSchema } from "@/lib/service-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageServiceWorkTypes(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = serviceWorkTypeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  try {
    const updated = await updateServiceWorkType(prisma, {
      id,
      name: parsed.data.name,
      defaultTargetDays: parsed.data.defaultTargetDays,
      isActive: parsed.data.isActive,
      displayOrder: parsed.data.displayOrder,
      performedByUserId: session.user.id,
      companyId: access.companyId,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapServiceError(error);
  }
}
