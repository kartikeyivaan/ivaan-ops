import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUpdateServiceStatus } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { changeServiceStatus } from "@/lib/service-service";
import { changeServiceStatusSchema } from "@/lib/service-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUpdateServiceStatus(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = changeServiceStatusSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  try {
    const updated = await changeServiceStatus(prisma, {
      companyId: access.companyId,
      id,
      status: parsed.data.status,
      note: parsed.data.note || undefined,
      waitingReason: parsed.data.waitingReason ?? null,
      nextActionDate: parsed.data.nextActionDate ?? undefined,
      performedByUserId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapServiceError(error);
  }
}
