import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewInventory } from "@/lib/inventory-permissions";
import { listStockSummary } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { inventorySearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const parsed = inventorySearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    warehouseId: searchParams.get("warehouseId") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const stock = await listStockSummary(prisma, companyId, parsed.data);
  return NextResponse.json(stock);
}
