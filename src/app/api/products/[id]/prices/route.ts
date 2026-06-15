import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canManageProductPricing, canViewProducts } from "@/lib/product-permissions";
import { addProductPrice } from "@/lib/product-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { productPriceSchema } from "@/lib/validations";

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
  const prices = await prisma.productPrice.findMany({
    where: { productId: id, companyId },
    orderBy: { effectiveFrom: "desc" },
  });

  return NextResponse.json(prices);
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProductPricing(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = productPriceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid price data.", 400, parsed.error.flatten());
  }

  if (parsed.data.minimumPrice > parsed.data.standardPrice) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Minimum price cannot exceed standard price.",
      400,
    );
  }

  try {
    const price = await addProductPrice(prisma, id, {
      companyId,
      landingCost: parsed.data.landingCost,
      standardPrice: parsed.data.standardPrice,
      minimumPrice: parsed.data.minimumPrice,
      effectiveFrom: parsed.data.effectiveFrom
        ? new Date(parsed.data.effectiveFrom)
        : undefined,
    });

    await writeAuditLog({
      tableName: "product_prices",
      recordId: price.id,
      action: "CREATE",
      performedBy: session.user.id,
      companyId,
      reference: id,
      newValue: price,
    });

    return NextResponse.json(price, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "MINIMUM_ABOVE_STANDARD") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Minimum price cannot exceed standard price.",
          400,
        );
      }
    }
    throw error;
  }
}
