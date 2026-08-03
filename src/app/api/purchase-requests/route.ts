import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canRaisePurchaseRequest,
  canViewAllPurchaseRequests,
} from "@/lib/purchase-request-permissions";
import {
  createPurchaseRequest,
  listPurchaseRequests,
} from "@/lib/purchase-request-service";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds, requireActiveCompany } from "@/lib/session";
import {
  createPurchaseRequestSchema,
  purchaseRequestSearchSchema,
} from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const parsed = purchaseRequestSearchSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const requests = await listPurchaseRequests(prisma, {
    companyId,
    status: parsed.data.status,
    requestedById: canViewAllPurchaseRequests(session.user.roles)
      ? undefined
      : session.user.id,
  });

  return NextResponse.json(requests);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canRaisePurchaseRequest(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  try {
    requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = createPurchaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid purchase request data.", 400, parsed.error.flatten());
  }

  const allowedCompanyIds = getSessionCompanyIds(session);
  if (!allowedCompanyIds.includes(parsed.data.companyId)) {
    return errorResponse("FORBIDDEN", "You do not have access to the selected company.", 403);
  }

  try {
    const created = await createPurchaseRequest(prisma, {
      companyId: parsed.data.companyId,
      warehouseId: parsed.data.warehouseId,
      remarks: parsed.data.remarks,
      requestedById: session.user.id,
      requestedByName: session.user.name ?? "User",
      lines: parsed.data.lines,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, [number, string, string]> = {
        LINES_REQUIRED: [400, "VALIDATION_ERROR", "Add at least one line item."],
        COMPANY_NOT_FOUND: [404, "NOT_FOUND", "Company not found."],
        WAREHOUSE_NOT_FOUND: [404, "NOT_FOUND", "Warehouse not found."],
        PRODUCT_REQUIRED: [400, "VALIDATION_ERROR", "Select or create a product for each line."],
        PRODUCT_NOT_FOUND: [404, "NOT_FOUND", "Product not found."],
        KIT_NOT_STOCKABLE: [
          400,
          "VALIDATION_ERROR",
          "Kit products cannot be requested. Request component products instead.",
        ],
        INVALID_QUANTITY: [400, "VALIDATION_ERROR", "Quantity must be greater than zero."],
        CATEGORY_NOT_FOUND: [404, "NOT_FOUND", "Product category not found."],
        BRAND_REQUIRED: [400, "VALIDATION_ERROR", "Brand is required for new products."],
        CAPACITY_REQUIRED: [400, "VALIDATION_ERROR", "Capacity is required for new products."],
        CAPACITY_UNIT_REQUIRED: [400, "VALIDATION_ERROR", "Capacity unit is required for new products."],
      };
      const mapped = map[error.message];
      if (mapped) {
        return errorResponse(mapped[1], mapped[2], mapped[0]);
      }
    }
    console.error("createPurchaseRequest failed", error);
    return errorResponse("INTERNAL_ERROR", "Could not create purchase request.", 500);
  }
}
