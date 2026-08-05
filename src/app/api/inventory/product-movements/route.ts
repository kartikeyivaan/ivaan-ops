import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canViewInventory } from "@/lib/inventory-permissions";
import { listProductPhysicalLedger } from "@/lib/product-physical-ledger-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

const querySchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

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
  const parsed = querySchema.safeParse({
    productId: searchParams.get("productId") ?? undefined,
    warehouseId: searchParams.get("warehouseId") || undefined,
    fromDate: searchParams.get("fromDate") || undefined,
    toDate: searchParams.get("toDate") || undefined,
  });

  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid filters. productId is required.",
      400,
      parsed.error.flatten(),
    );
  }

  const result = await listProductPhysicalLedger(prisma, companyId, parsed.data);
  if (!result) {
    return errorResponse("NOT_FOUND", "Product not found.", 404);
  }

  return NextResponse.json(result);
}
