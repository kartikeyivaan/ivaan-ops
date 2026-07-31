import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import {
  canCreateTransfer,
  canViewTransferSerials,
  canViewTransfers,
} from "@/lib/transfer-permissions";
import {
  createTransfer,
  listTransfers,
  serializeTransferForRole,
} from "@/lib/transfer-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { createTransferSchema, transferSearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewTransfers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const parsed = transferSearchSchema.safeParse({
    direction: searchParams.get("direction") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const transfers = await listTransfers(prisma, companyId, parsed.data);
  const includeSerials = canViewTransferSerials(session.user.roles);

  return NextResponse.json(
    transfers.map((transfer) => serializeTransferForRole(transfer, includeSerials)),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canCreateTransfer(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = createTransferSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid transfer data.",
      400,
      parsed.error.flatten(),
    );
  }

  const toWarehouse = await prisma.warehouse.findFirst({
    where: { id: parsed.data.toWarehouseId, isActive: true },
    select: { companyId: true },
  });
  if (!toWarehouse) {
    return errorResponse("NOT_FOUND", "Destination warehouse not found.", 404);
  }

  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (
    !assertCompanyAccess(session.user.roles, userCompanyIds, companyId) ||
    !assertCompanyAccess(session.user.roles, userCompanyIds, toWarehouse.companyId)
  ) {
    return errorResponse("FORBIDDEN", "You do not have access to one of the companies.", 403);
  }

  try {
    await assertInventoryOpsAllowed(prisma, companyId);

    const transfer = await createTransfer(prisma, {
      fromCompanyId: companyId,
      fromWarehouseId: parsed.data.fromWarehouseId,
      toWarehouseId: parsed.data.toWarehouseId,
      notes: parsed.data.notes,
      lines: parsed.data.lines,
      createdById: session.user.id,
    });

    const includeSerials = canViewTransferSerials(session.user.roles);
    return NextResponse.json(
      serializeTransferForRole(transfer, includeSerials),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVENTORY_OPS_BLOCKED") {
        return errorResponse(
          "INVENTORY_OPS_BLOCKED",
          "Inventory operations are blocked until Opening Stock Audit is approved for all warehouses.",
          423,
        );
      }
      if (error.message === "FROM_WAREHOUSE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Source warehouse not found.", 404);
      }
      if (error.message === "TO_WAREHOUSE_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Destination warehouse not found.", 404);
      }
      if (error.message === "SAME_WAREHOUSE") {
        return errorResponse("VALIDATION_ERROR", "Source and destination must differ.", 400);
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "SERIAL_REQUIRED") {
        return errorResponse(
          "SERIAL_REQUIRED",
          "Serial numbers are mandatory for this product.",
          400,
        );
      }
      if (error.message === "NEGATIVE_STOCK_BLOCKED") {
        return errorResponse("NEGATIVE_STOCK_BLOCKED", "Insufficient available stock.", 400);
      }
    }
    throw error;
  }
}
