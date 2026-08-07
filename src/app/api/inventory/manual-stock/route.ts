import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAdjustStock } from "@/lib/inventory-permissions";
import {
  createManualConditionChange,
  createManualQtyAdjust,
  createManualStockIn,
  createManualStockOut,
  listManualStockEntries,
  serializeManualStockEntry,
} from "@/lib/manual-stock-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { manualStockEntrySchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

function mapManualStockError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const message = error.message;

  if (message === "NEGATIVE_STOCK_BLOCKED") {
    return errorResponse("NEGATIVE_STOCK_BLOCKED", "This action would create negative stock.", 400);
  }
  if (message === "WAREHOUSE_NOT_FOUND") {
    return errorResponse("WAREHOUSE_NOT_FOUND", "Warehouse not found for this company.", 400);
  }
  if (message === "PRODUCT_NOT_FOUND") {
    return errorResponse("PRODUCT_NOT_FOUND", "Product not found or inactive.", 400);
  }
  if (message === "SERIAL_TRACKING_REQUIRED") {
    return errorResponse(
      "SERIAL_TRACKING_REQUIRED",
      "Use the serial flow for serial-tracked products.",
      400,
    );
  }
  if (message === "USE_SERIAL_FLOW") {
    return errorResponse(
      "USE_SERIAL_FLOW",
      "This product requires serial numbers. Use Inventory In / Out with serials.",
      400,
    );
  }
  if (message === "SERIALS_REQUIRED") {
    return errorResponse("SERIALS_REQUIRED", "Enter at least one serial number.", 400);
  }
  if (message === "DUPLICATE_SERIAL_IN_REQUEST") {
    return errorResponse(
      "DUPLICATE_SERIAL_IN_REQUEST",
      "Duplicate serial numbers in the request.",
      400,
    );
  }
  if (message === "INVALID_QUANTITY") {
    return errorResponse("INVALID_QUANTITY", "Quantity must be greater than zero.", 400);
  }

  const serialCodes = [
    "SERIAL_NOT_FOUND",
    "SERIAL_PRODUCT_MISMATCH",
    "SERIAL_COMPANY_MISMATCH",
    "SERIAL_WAREHOUSE_MISMATCH",
    "SERIAL_NOT_REMOVABLE",
    "SERIAL_CONDITION_LOCKED",
    "SERIAL_ALREADY_CONDITION",
  ] as const;

  for (const code of serialCodes) {
    if (message.startsWith(`${code}:`)) {
      const serial = message.slice(code.length + 1);
      const human: Record<(typeof serialCodes)[number], string> = {
        SERIAL_NOT_FOUND: `Serial ${serial} was not found.`,
        SERIAL_PRODUCT_MISMATCH: `Serial ${serial} belongs to a different product.`,
        SERIAL_COMPANY_MISMATCH: `Serial ${serial} belongs to a different company.`,
        SERIAL_WAREHOUSE_MISMATCH: `Serial ${serial} is not in the selected warehouse.`,
        SERIAL_NOT_REMOVABLE: `Serial ${serial} cannot be used for this action (wrong status).`,
        SERIAL_CONDITION_LOCKED: `Serial ${serial} cannot change condition in its current status.`,
        SERIAL_ALREADY_CONDITION: `Serial ${serial} is already in the requested condition.`,
      };
      return errorResponse(code, human[code], 400, { serialNumber: serial });
    }
  }

  return null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canAdjustStock(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const entries = await listManualStockEntries(prisma, companyId);
  return NextResponse.json(entries.map(serializeManualStockEntry));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canAdjustStock(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = manualStockEntrySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid manual stock data.", 400, parsed.error.flatten());
  }

  try {
    const data = parsed.data;
    let entry;

    if ("mode" in data && data.mode === "QTY") {
      entry = await createManualQtyAdjust(prisma, {
        companyId,
        warehouseId: data.warehouseId,
        productId: data.productId,
        direction: data.action,
        qty: data.qty,
        reason: data.reason,
        notes: data.notes,
        createdById: session.user.id,
      });
    } else if (!("mode" in data) && data.action === "IN") {
      entry = await createManualStockIn(prisma, {
        companyId,
        warehouseId: data.warehouseId,
        productId: data.productId,
        serialNumbers: data.serialNumbers,
        condition: data.condition,
        reason: data.reason,
        notes: data.notes,
        createdById: session.user.id,
      });
    } else if (!("mode" in data) && data.action === "OUT") {
      entry = await createManualStockOut(prisma, {
        companyId,
        warehouseId: data.warehouseId,
        productId: data.productId,
        serialNumbers: data.serialNumbers,
        reason: data.reason,
        notes: data.notes,
        createdById: session.user.id,
      });
    } else if (!("mode" in data) && data.action === "CHANGE_CONDITION") {
      entry = await createManualConditionChange(prisma, {
        companyId,
        warehouseId: data.warehouseId,
        productId: data.productId,
        serialNumbers: data.serialNumbers,
        condition: data.condition,
        reason: data.reason,
        notes: data.notes,
        createdById: session.user.id,
      });
    } else {
      return errorResponse("VALIDATION_ERROR", "Unsupported manual stock action.", 400);
    }

    return NextResponse.json(serializeManualStockEntry(entry), { status: 201 });
  } catch (error) {
    const mapped = mapManualStockError(error);
    if (mapped) return mapped;
    throw error;
  }
}
