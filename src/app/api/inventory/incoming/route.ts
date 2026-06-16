import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canCreateIncoming,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import { createIncomingLot, listIncomingLots, serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany, getSessionCompanyIds } from "@/lib/session";
import { incomingLotSchema, inventorySearchSchema } from "@/lib/validations";

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
    warehouseId: searchParams.get("warehouseId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const lots = await listIncomingLots(prisma, companyId, parsed.data);
  const includeSerials = canViewSerialNumbers(session.user.roles);

  return NextResponse.json(
    lots.map((lot) => serializeLotForRole(lot, includeSerials)),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canCreateIncoming(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  try {
    requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = incomingLotSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid incoming lot data.", 400, parsed.error.flatten());
  }

  const allowedCompanyIds = getSessionCompanyIds(session);
  if (!allowedCompanyIds.includes(parsed.data.companyId)) {
    return errorResponse("FORBIDDEN", "You do not have access to the selected company.", 403);
  }

  try {
    const lot = await createIncomingLot(prisma, {
      companyId: parsed.data.companyId,
      warehouseId: parsed.data.warehouseId,
      vendorId: parsed.data.vendorId,
      purchaseInvoiceNo: parsed.data.purchaseInvoiceNo,
      purchaseDate: new Date(parsed.data.purchaseDate),
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      unitPurchaseRate: parsed.data.unitPurchaseRate,
      transportCharges: parsed.data.transportCharges,
      commissionCharges: parsed.data.commissionCharges,
      createdById: session.user.id,
    });

    return NextResponse.json(
      serializeLotForRole(lot, canViewSerialNumbers(session.user.roles)),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "WAREHOUSE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Warehouse not found.", 404);
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "VENDOR_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Vendor not found.", 404);
      }
      if (error.message === "INVALID_QUANTITY") {
        return errorResponse("VALIDATION_ERROR", "Quantity must be greater than zero.", 400);
      }
    }

    console.error("POST /api/inventory/incoming failed:", error);
    return errorResponse(
      "SERVER_ERROR",
      error instanceof Error
        ? error.message
        : "Failed to create incoming lot. Restart the dev server if schema was recently updated.",
      500,
    );
  }
}
