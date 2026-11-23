import { prisma } from "@/lib/prisma";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { closeInvestigation } from "@/lib/monthly-serial-audit-investigation";

type Params = { params: Promise<{ id: string }> };

/** POST: close the investigation (Super Admin). Every item must be resolved first. */
export async function POST(_request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  try {
    return Response.json(await closeInvestigation(prisma, { auditId: id, userId: guard.userId }));
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to close investigation.");
  }
}
