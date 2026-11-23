import { z } from "zod";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { MAX_INVESTIGATION_BATCH, resolveInvestigation } from "@/lib/monthly-serial-audit-investigation";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const resolveSchema = z
  .object({
    action: z.enum(["FOUND", "WRITE_OFF", "ADDED"]),
    findingIds: z.array(z.string().uuid()).max(MAX_INVESTIGATION_BATCH).optional(),
    serialNumbers: z.array(z.string().min(1).max(200)).max(MAX_INVESTIGATION_BATCH).optional(),
    note: z.string().max(500).optional().nullable(),
  })
  .refine((v) => (v.findingIds?.length ?? 0) + (v.serialNumbers?.length ?? 0) > 0, {
    message: "Select at least one serial.",
  });

/** POST: resolve selected investigation items (Super Admin). */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const parsed = resolveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return auditErrorResponse("VALIDATION_ERROR", "Select at least one serial and an action.", 400);
  }

  const { id } = await params;
  try {
    return Response.json(
      await resolveInvestigation(prisma, {
        auditId: id,
        userId: guard.userId,
        action: parsed.data.action,
        findingIds: parsed.data.findingIds,
        serialNumbers: parsed.data.serialNumbers,
        note: parsed.data.note ?? null,
      }),
    );
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to update serials.");
  }
}
