import { NextResponse } from "next/server";
import { CapacityUnit } from "@prisma/client";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  canEditProducts,
  canManageProductPricing,
  canViewProducts,
} from "@/lib/product-permissions";
import { createProduct, listProducts } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { productSchema, productSearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const parsed = productSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
    isActive: searchParams.get("isActive") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid search filters.", 400, parsed.error.flatten());
  }

  const products = await listProducts(prisma, companyId, parsed.data);
  return NextResponse.json(products);
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid product data.", 400, parsed.error.flatten());
  }

  if (parsed.data.initialPrice && !canManageProductPricing(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission to set product pricing.", 403);
  }

  if (
    parsed.data.initialPrice &&
    parsed.data.initialPrice.minimumPrice > parsed.data.initialPrice.standardPrice
  ) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Minimum price cannot exceed standard price.",
      400,
    );
  }

  try {
    const created = await createProduct(prisma, {
      categoryId: parsed.data.categoryId,
      brandName: parsed.data.brandName,
      technologyName: parsed.data.technologyName,
      capacity: parsed.data.capacity,
      capacityUnit: parsed.data.capacityUnit as CapacityUnit | undefined,
      hsn: parsed.data.hsn,
      gstRate: parsed.data.gstRate,
      isActive: parsed.data.isActive,
      kitComponents: parsed.data.kitComponents,
      initialPrice: parsed.data.initialPrice
        ? {
            landingCost: parsed.data.initialPrice.landingCost,
            standardPrice: parsed.data.initialPrice.standardPrice,
            minimumPrice: parsed.data.initialPrice.minimumPrice,
            effectiveFrom: parsed.data.initialPrice.effectiveFrom
              ? new Date(parsed.data.initialPrice.effectiveFrom)
              : undefined,
          }
        : undefined,
    });

    await writeAuditLog({
      tableName: "products",
      recordId: created.id,
      action: "CREATE",
      performedBy: session.user.id,
      companyId,
      newValue: {
        displayName: created.displayName,
        pricingType: created.pricingType,
        gstRate: created.gstRate,
        kitComponents: created.kitComponents?.length ?? 0,
      },
    });

    return NextResponse.json(created, { status: 201 });
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
