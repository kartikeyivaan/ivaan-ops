import { z } from "zod";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  addMonthlyAuditQtyLine,
  getMonthlyAuditQtyOptions,
} from "@/lib/monthly-serial-audit-lines";
import {
  canScanMonthlyAudit,
  canViewMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** GET: products and warehouses (with company) to choose from when adding a line. */
export async function GET() {
  const guard = await requireMonthlyAuditUser(canViewMonthlyAudit);
  if ("response" in guard) return guard.response;
  return Response.json(await getMonthlyAuditQtyOptions(prisma));
}

const addSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  auditQty: z.number().finite().min(0),
});

/** POST: add a non-serialized product for a company and warehouse, with its counted quantity. */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canScanMonthlyAudit);
  if ("response" in guard) return guard.response;

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return auditErrorResponse("VALIDATION_ERROR", "Choose a product, warehouse and count.", 400);
  }

  const { id } = await params;
  try {
    const line = await addMonthlyAuditQtyLine(prisma, {
      auditId: id,
      productId: parsed.data.productId,
      warehouseId: parsed.data.warehouseId,
      auditQty: parsed.data.auditQty,
    });
    return Response.json(line, { status: 201 });
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to add product.");
  }
}
