import { z } from "zod";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { MAX_INVESTIGATION_BATCH, undoInvestigationResolution } from "@/lib/monthly-serial-audit-investigation";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const undoSchema = z.object({
  findingIds: z.array(z.string().uuid()).min(1).max(MAX_INVESTIGATION_BATCH),
  reason: z.string().trim().min(3).max(500),
});

/** POST: revert a mistaken resolution so the serial can be investigated again (Super Admin). */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const parsed = undoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return auditErrorResponse("VALIDATION_ERROR", "Select an item and enter a reason (3+ characters).", 400);
  }

  const { id } = await params;
  try {
    return Response.json(
      await undoInvestigationResolution(prisma, {
        auditId: id,
        userId: guard.userId,
        findingIds: parsed.data.findingIds,
        reason: parsed.data.reason,
      }),
    );
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to undo the resolution.");
  }
}
