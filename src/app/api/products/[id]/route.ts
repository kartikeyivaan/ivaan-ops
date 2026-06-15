import { NextResponse } from "next/server";
import { CapacityUnit } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canEditProducts, canViewProducts } from "@/lib/product-permissions";
import { getProductById, updateProduct } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { productUpdateSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewProducts(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const product = await getProductById(prisma, id, companyId);
  if (!product) {
    return errorResponse("NOT_FOUND", "Product not found.", 404);
  }

  return NextResponse.json(product);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canEditProducts(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return errorResponse("NOT_FOUND", "Product not found.", 404);
  }

  const body = await request.json();
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid product data.", 400, parsed.error.flatten());
  }

  try {
    const product = await updateProduct(prisma, id, {
      categoryId: parsed.data.categoryId,
      brandName: parsed.data.brandName,
      technologyName: parsed.data.technologyName,
      capacity: parsed.data.capacity,
      capacityUnit: parsed.data.capacityUnit as CapacityUnit | undefined,
      hsn: parsed.data.hsn,
      gstRate: parsed.data.gstRate,
      isActive: parsed.data.isActive,
    });

    await writeAuditLog({
      tableName: "products",
      recordId: product.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId,
      oldValue: existing,
      newValue: product,
    });

    return NextResponse.json(product);
  } catch (error) {
    if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Product category not found.", 404);
    }
    throw error;
  }
}
