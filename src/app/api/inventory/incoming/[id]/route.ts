import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isReferentialConstraintError } from "@/lib/api-response";
import {
  canCreateIncoming,
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import {
  deleteIncomingLot,
  getLotById,
  serializeLotForRole,
  SimilarIncomingLotError,
  updateIncomingLot,
} from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { incomingLotUpdateSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  const lot = await getLotById(prisma, id, companyId);
  if (!lot) {
    return errorResponse("NOT_FOUND", "Incoming lot not found.", 404);
  }

  return NextResponse.json(
    serializeLotForRole(lot, canViewSerialNumbers(session.user.roles)),
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canCreateIncoming(session.user.roles)) {
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
  const parsed = incomingLotUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid incoming lot data.", 400, parsed.error.flatten());
  }

  try {
    const lot = await updateIncomingLot(prisma, id, companyId, {
      warehouseId: parsed.data.warehouseId,
      vendorId: parsed.data.vendorId,
      purchaseInvoiceNo: parsed.data.purchaseInvoiceNo,
      purchaseDate: new Date(parsed.data.purchaseDate),
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      unitPurchaseRate: parsed.data.unitPurchaseRate,
      transportCharges: parsed.data.transportCharges,
      commissionCharges: parsed.data.commissionCharges,
      updatedById: session.user.id,
      confirmSimilar: parsed.data.confirmSimilar,
    });

    return NextResponse.json(
      serializeLotForRole(lot, canViewSerialNumbers(session.user.roles)),
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Incoming lot not found.", 404);
      }
      if (error.message === "LOT_NOT_EDITABLE") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Only pending incoming lots with no receipts can be edited.",
          400,
        );
      }
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
      error.code === "P2002" &&
      String(error.meta?.target ?? "").includes("purchase_invoice_no")
    ) {
      return errorResponse(
        "DUPLICATE_PURCHASE_INVOICE",
        "This purchase invoice number already exists.",
        409,
      );
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canCreateIncoming(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;

  try {
    await deleteIncomingLot(prisma, id, companyId, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Incoming lot not found.", 404);
      }
      if (error.message === "LOT_NOT_EDITABLE") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Only pending incoming lots with no receipts can be deleted.",
          400,
        );
      }
      if (error.message === "LOT_HAS_SERIALS" || error.message === "LOT_HAS_RECEIPTS") {
        return errorResponse(
          "VALIDATION_ERROR",
          "This lot cannot be deleted because material has already been received.",
          400,
        );
      }
    }

    if (isReferentialConstraintError(error)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "This lot cannot be deleted because it is linked to other inventory records.",
        400,
      );
    }

    console.error("DELETE /api/inventory/incoming/[id] failed:", error);
    return errorResponse(
      "SERVER_ERROR",
      error instanceof Error ? error.message : "Failed to delete incoming lot.",
      500,
    );
  }
}
