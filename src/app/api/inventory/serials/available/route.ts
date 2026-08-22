import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewAvailableSerials } from "@/lib/inventory-permissions";
import { listAvailableProductSerials } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { buildExcelBuffer, exportFilename } from "@/lib/report-export";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewAvailableSerials(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId")?.trim();
  const warehouseId = searchParams.get("warehouseId")?.trim() || undefined;
  const format = searchParams.get("format");

  if (!productId) {
    return errorResponse("VALIDATION_ERROR", "productId is required.", 400);
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: { id: true, displayName: true, serialTracking: true },
  });
  if (!product) {
    return errorResponse("NOT_FOUND", "Product not found.", 404);
  }
  if (!product.serialTracking) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Selected product is not serial-tracked.",
      400,
    );
  }

  if (warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId, isActive: true },
      select: { id: true },
    });
    if (!warehouse) {
      return errorResponse("NOT_FOUND", "Warehouse not found.", 404);
    }
  }

  const serials = await listAvailableProductSerials(prisma, {
    companyId,
    productId,
    warehouseId,
  });

  const items = serials.map((serial, index) => ({
    index: index + 1,
    serialNumber: serial.serialNumber,
    warehouse: serial.currentWarehouse.name,
    warehouseId: serial.currentWarehouse.id,
    lotNumber: serial.lot.lotNumber,
    productName: serial.product.displayName,
    status: serial.status,
    createdAt: serial.createdAt.toISOString(),
  }));

  if (format === "xlsx") {
    const buffer = buildExcelBuffer(
      items.map((row) => ({
        index: row.index,
        serialNumber: row.serialNumber,
        productName: row.productName,
        warehouse: row.warehouse,
        lotNumber: row.lotNumber,
        status: row.status,
        createdAt: formatDate(row.createdAt),
      })),
      "Available Serials",
      [
        { key: "index", header: "#" },
        { key: "serialNumber", header: "Serial Number" },
        { key: "productName", header: "Product" },
        { key: "warehouse", header: "Warehouse" },
        { key: "lotNumber", header: "Lot Number" },
        { key: "status", header: "Status" },
        { key: "createdAt", header: "Recorded On" },
      ],
    );

    const filename = exportFilename("available-serials", "xlsx");
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({
    product: { id: product.id, displayName: product.displayName },
    count: items.length,
    items,
  });
}
