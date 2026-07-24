import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCompleteService } from "@/lib/service-permissions";
import { mapServiceError, resolveServiceAccess, serviceError } from "@/lib/service-api";
import { completeServiceWork } from "@/lib/service-service";
import { completeServiceSchema } from "@/lib/service-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canCompleteService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = completeServiceSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  try {
    const updated = await completeServiceWork(prisma, {
      companyId: access.companyId,
      id,
      workCompleted: parsed.data.workCompleted,
      completionDate: parsed.data.completionDate,
      systemStatusAfterWork: parsed.data.systemStatusAfterWork,
      customerConfirmation: parsed.data.customerConfirmation ?? null,
      furtherWorkRequired: parsed.data.furtherWorkRequired,
      attachmentUrl: parsed.data.attachmentUrl || undefined,
      attachmentName: parsed.data.attachmentName || undefined,
      performedByUserId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapServiceError(error);
  }
}
