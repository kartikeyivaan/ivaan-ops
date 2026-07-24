import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageServiceWorkTypes } from "@/lib/service-permissions";
import { resolveServiceAccess, serviceError } from "@/lib/service-api";
import { reorderServiceWorkTypes } from "@/lib/service-service";
import { serviceWorkTypeReorderSchema } from "@/lib/service-validations";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageServiceWorkTypes(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const body = await request.json();
  const parsed = serviceWorkTypeReorderSchema.safeParse(body);
  if (!parsed.success) {
    return serviceError("VALIDATION_ERROR", "Invalid data.", 400, parsed.error.flatten());
  }

  await reorderServiceWorkTypes(prisma, parsed.data.orderedIds);
  return NextResponse.json({ ok: true });
}
