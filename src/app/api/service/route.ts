import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateService, canViewService } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { createServiceRequest, listServiceRequests } from "@/lib/service-service";
import { createServiceRequestSchema, serviceListQuerySchema } from "@/lib/service-validations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(request.url);
  const parsed = serviceListQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries()),
  );
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  // "My Requests" quick filter or restricted roles limit to the current user.
  const restrictToUserId =
    parsed.data.quickFilter === "my" ? session.user.id : access.restrictToUserId;

  const result = await listServiceRequests(prisma, access.companyId, {
    ...parsed.data,
    restrictToUserId,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canCreateService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const body = await request.json();
  const parsed = createServiceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError(
      "VALIDATION_ERROR",
      "Invalid service request data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const created = await createServiceRequest(prisma, {
      ...parsed.data,
      companyId: access.companyId,
      createdByUserId: session.user.id,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapServiceError(error);
  }
}
