import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canCreateIncoming,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import {
  createIncomingLot,
  listIncomingLots,
  serializeLotForRole,
  SimilarIncomingLotError,
} from "@/lib/inventory-service";
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
    await assertInventoryOpsAllowed(prisma, parsed.data.companyId);

    const lot = await createIncomingLot(prisma, {
      companyId: parsed.data.companyId,
      warehouseId: parsed.data.warehouseId,
      vendorId: parsed.data.vendorId,
      purchaseInvoiceNo: parsed.data.purchaseInvoiceNo,
      purchaseDate: new Date(parsed.data.purchaseDate),
      expectedMinDate: parsed.data.expectedMinDate ? new Date(parsed.data.expectedMinDate) : null,
      expectedMaxDate: parsed.data.expectedMaxDate ? new Date(parsed.data.expectedMaxDate) : null,
      productId: parsed.data.productId,
      purchaseRequestLineId: parsed.data.purchaseRequestLineId,
      quantity: parsed.data.quantity,
      unitPurchaseRate: parsed.data.unitPurchaseRate,
      transportCharges: parsed.data.transportCharges,
      commissionCharges: parsed.data.commissionCharges,
      createdById: session.user.id,
      confirmSimilar: parsed.data.confirmSimilar,
    });

    return NextResponse.json(
      serializeLotForRole(lot, canViewSerialNumbers(session.user.roles)),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVENTORY_OPS_BLOCKED") {
      return errorResponse(
        "INVENTORY_OPS_BLOCKED",
        "Inventory operations are blocked until Opening Stock Audit is approved for all warehouses.",
        423,
      );
    }
    if (error instanceof Error) {
      if (error.message === "WAREHOUSE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Warehouse not found.", 404);
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "KIT_NOT_STOCKABLE") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Kit products cannot be received into inventory. Receive component products instead.",
          400,
        );
      }
      if (error.message === "VENDOR_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Vendor not found.", 404);
      }
      if (error.message === "INVALID_QUANTITY") {
        return errorResponse("VALIDATION_ERROR", "Quantity must be greater than zero.", 400);
      }
      if (error.message === "INVALID_ARRIVAL_WINDOW") {
        return errorResponse("VALIDATION_ERROR", "Expected arrival end date must be on or after the start date.", 400);
      }
      if (error.message === "PURCHASE_INVOICE_REQUIRED") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Purchase invoice number is required.",
          400,
        );
      }
      if (error.message === "DUPLICATE_PURCHASE_INVOICE") {
        return errorResponse(
          "DUPLICATE_PURCHASE_INVOICE",
          "This purchase invoice number already exists.",
          409,
        );
      }
      if (error.message === "PURCHASE_REQUEST_LINE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Purchase request line not found.", 404);
      }
      if (error.message === "PURCHASE_REQUEST_COMPANY_MISMATCH") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Purchase request does not belong to the selected company.",
          400,
        );
      }
      if (error.message === "PURCHASE_REQUEST_PRODUCT_MISMATCH") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Product must match the purchase request line.",
          400,
        );
      }
      if (error.message === "PURCHASE_REQUEST_CLOSED") {
        return errorResponse(
          "VALIDATION_ERROR",
          "This purchase request is closed and cannot be fulfilled.",
          400,
        );
      }
      if (error.message === "FULFILLMENT_EXCEEDS_REQUEST") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Quantity exceeds remaining requested quantity on the purchase request line.",
          400,
        );
      }
    }

    if (error instanceof SimilarIncomingLotError) {
      return errorResponse(
        "SIMILAR_ENTRY_EXISTS",
        "A similar incoming purchase record already exists.",
        409,
        { matches: error.matches },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("purchase_invoice_no")) {
        return errorResponse(
          "DUPLICATE_PURCHASE_INVOICE",
          "This purchase invoice number already exists.",
          409,
        );
      }
      if (target.includes("lot_number")) {
        return errorResponse(
          "DUPLICATE_LOT_NUMBER",
          "Could not assign a unique lot number. Please try again.",
          409,
        );
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
