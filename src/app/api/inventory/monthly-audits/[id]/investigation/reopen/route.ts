import { z } from "zod";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { reopenInvestigation } from "@/lib/monthly-serial-audit-investigation";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const reopenSchema = z.object({ reason: z.string().max(500) });

/** POST: reopen a closed investigation (Super Admin), with a reason. */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const parsed = reopenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return auditErrorResponse("VALIDATION_ERROR", "Enter a reason.", 400);

  const { id } = await params;
  try {
    return Response.json(
      await reopenInvestigation(prisma, { auditId: id, userId: guard.userId, reason: parsed.data.reason }),
    );
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to reopen investigation.");
  }
}
