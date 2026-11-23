import { z } from "zod";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import { updateMonthlyAuditQtyLine } from "@/lib/monthly-serial-audit-approve";
import {
  canScanMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; lineId: string }> };

const countSchema = z.object({ auditQty: z.number().finite().min(0) });

/** PATCH: record the counted quantity for a non-serialized product (section B). */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canScanMonthlyAudit);
  if ("response" in guard) return guard.response;

  const parsed = countSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return auditErrorResponse("VALIDATION_ERROR", "Enter a valid quantity.", 400, parsed.error.flatten());
  }

  const { id, lineId } = await params;
  try {
    const line = await updateMonthlyAuditQtyLine(prisma, {
      auditId: id,
      lineId,
      auditQty: parsed.data.auditQty,
      userId: guard.userId,
    });
    return Response.json(line);
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to save count.");
  }
}
