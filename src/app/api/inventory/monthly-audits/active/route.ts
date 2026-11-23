import { prisma } from "@/lib/prisma";
import {
  canViewMonthlyAudit,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { getActiveMonthlyAudit } from "@/lib/monthly-serial-audit-service";

/** GET: the run that is open or awaiting approval, if any. Drives the sidebar and dashboard link. */
export async function GET() {
  const guard = await requireMonthlyAuditUser(canViewMonthlyAudit);
  if ("response" in guard) return guard.response;

  const active = await getActiveMonthlyAudit(prisma);
  return Response.json({
    active: active
      ? { id: active.id, auditNumber: active.auditNumber, status: active.status }
      : null,
  });
}
