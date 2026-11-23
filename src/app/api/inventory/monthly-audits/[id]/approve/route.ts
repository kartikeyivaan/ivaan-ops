import { prisma } from "@/lib/prisma";
import { approveMonthlyAudit } from "@/lib/monthly-serial-audit-approve";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";

type Params = { params: Promise<{ id: string }> };

/** POST: approve a CLOSED run and apply section B quantities (Super Admin only). */
export async function POST(_request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  try {
    return Response.json(
      await approveMonthlyAudit(prisma, { auditId: id, userId: guard.userId }),
    );
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to approve monthly audit.");
  }
}
