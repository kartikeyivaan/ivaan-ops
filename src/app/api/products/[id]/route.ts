import { NextResponse } from "next/server";
import { CapacityUnit } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isReferentialConstraintError } from "@/lib/api-response";
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
      kitComponents: parsed.data.kitComponents,
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
    if (error instanceof Error) {
      switch (error.message) {
        case "CATEGORY_NOT_FOUND":
          return errorResponse("NOT_FOUND", "Product category not found.", 404);
        case "KIT_COMPONENTS_REQUIRED":
          return errorResponse("VALIDATION_ERROR", "Add at least one kit component.", 400);
        case "KIT_DUPLICATE_COMPONENT":
          return errorResponse("VALIDATION_ERROR", "Duplicate component in kit BOM.", 400);
        case "KIT_COMPONENT_NOT_FOUND":
          return errorResponse("VALIDATION_ERROR", "One or more kit components were not found.", 400);
        case "KIT_NESTED_NOT_ALLOWED":
          return errorResponse("VALIDATION_ERROR", "Kits cannot include other kits.", 400);
        case "BRAND_REQUIRED":
          return errorResponse("VALIDATION_ERROR", "Brand is required.", 400);
        case "CAPACITY_REQUIRED":
        case "CAPACITY_UNIT_REQUIRED":
          return errorResponse("VALIDATION_ERROR", "Capacity and unit are required.", 400);
      }
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

  try {
    await prisma.product.delete({ where: { id } });

    await writeAuditLog({
      tableName: "products",
      recordId: id,
      action: "CANCEL",
      performedBy: session.user.id,
      companyId,
      oldValue: existing,
      newValue: { deleted: true },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (!isReferentialConstraintError(error)) {
      console.error("DELETE /api/products/[id] failed:", error);
      return errorResponse(
        "SERVER_ERROR",
        error instanceof Error ? error.message : "Failed to delete product.",
        500,
      );
    }

    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    await writeAuditLog({
      tableName: "products",
      recordId: product.id,
      action: "UPDATE",
      performedBy: session.user.id,
      companyId,
      oldValue: existing,
      newValue: {
        displayName: product.displayName,
        isActive: product.isActive,
        deactivated: true,
        reason: "Product has existing records and cannot be permanently deleted.",
      },
    });

    return NextResponse.json({
      deleted: false,
      deactivated: true,
      message:
        "Product has existing inventory, sales, or transaction records and was deactivated instead of permanently deleted.",
    });
  }
}
