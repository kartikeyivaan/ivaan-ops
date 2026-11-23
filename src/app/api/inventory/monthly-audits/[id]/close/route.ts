import { prisma } from "@/lib/prisma";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { closeMonthlyAudit } from "@/lib/monthly-serial-audit-service";

type Params = { params: Promise<{ id: string }> };

/** POST: close scanning and build the Missing and Additional lists (Super Admin). */
export async function POST(_request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  try {
    return Response.json(
      await closeMonthlyAudit(prisma, { auditId: id, userId: guard.userId }),
    );
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to close monthly audit.");
  }
}
