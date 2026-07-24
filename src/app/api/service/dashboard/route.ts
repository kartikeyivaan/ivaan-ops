import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewService } from "@/lib/service-permissions";
import { resolveServiceAccess, serviceError } from "@/lib/service-api";
import { getServiceDashboardMetrics } from "@/lib/service-service";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canViewService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const metrics = await getServiceDashboardMetrics(
    prisma,
    access.companyId,
    access.restrictToUserId,
  );
  return NextResponse.json(metrics);
}
