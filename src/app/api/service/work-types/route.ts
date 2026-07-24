import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageServiceWorkTypes, canViewService } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { createServiceWorkType, listServiceWorkTypes } from "@/lib/service-service";
import { serviceWorkTypeCreateSchema } from "@/lib/service-validations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(request.url);
  const includeInactive =
    searchParams.get("includeInactive") === "true" &&
    canManageServiceWorkTypes(session.user.roles);

  const workTypes = await listServiceWorkTypes(prisma, { includeInactive });
  return NextResponse.json(workTypes);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageServiceWorkTypes(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const body = await request.json();
  const parsed = serviceWorkTypeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  try {
    const created = await createServiceWorkType(prisma, {
      name: parsed.data.name,
      defaultTargetDays: parsed.data.defaultTargetDays ?? null,
      isActive: parsed.data.isActive,
      performedByUserId: session.user.id,
      companyId: access.companyId,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapServiceError(error);
  }
}
