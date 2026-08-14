import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import { canReturnProjectStock } from "@/lib/project-permissions";
import { mapProjectError, projectErrorResponse } from "@/lib/project-api";
import { returnProjectStock } from "@/lib/project-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { returnProjectStockSchema } from "@/lib/validations";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canReturnProjectStock(session.user.roles)) {
    return projectErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = returnProjectStockSchema.safeParse(body);
  if (!parsed.success) {
    return projectErrorResponse(
      "VALIDATION_ERROR",
      "Invalid return stock data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    await assertInventoryOpsAllowed(prisma, companyId);

    const project = await returnProjectStock(prisma, {
      companyId,
      projectId: id,
      lineId: parsed.data.lineId,
      qty: parsed.data.qty,
      performedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapProjectError(error);
    if (mapped) return mapped;
    throw error;
  }
}
