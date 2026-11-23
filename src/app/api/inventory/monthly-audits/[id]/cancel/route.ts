import { z } from "zod";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { prisma } from "@/lib/prisma";
import { cancelMonthlyAudit } from "@/lib/monthly-serial-audit-service";

type Params = { params: Promise<{ id: string }> };

const cancelSchema = z.object({ reason: z.string().max(500) });

/** POST: cancel an OPEN or CLOSED run, with a reason (Super Admin). */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const parsed = cancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return auditErrorResponse("VALIDATION_ERROR", "Enter a reason for cancelling.", 400);
  }

  const { id } = await params;
  try {
    return Response.json(
      await cancelMonthlyAudit(prisma, {
        auditId: id,
        userId: guard.userId,
        reason: parsed.data.reason,
      }),
    );
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to cancel monthly audit.");
  }
}
