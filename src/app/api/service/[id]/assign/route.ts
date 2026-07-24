import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAssignService } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { assignServiceRequest } from "@/lib/service-service";
import { assignServiceSchema } from "@/lib/service-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAssignService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = assignServiceSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  try {
    const updated = await assignServiceRequest(prisma, {
      companyId: access.companyId,
      id,
      assignedToUserId: parsed.data.assignedToUserId ?? null,
      targetCompletionDate: parsed.data.targetCompletionDate ?? undefined,
      note: parsed.data.note || undefined,
      performedByUserId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapServiceError(error);
  }
}
