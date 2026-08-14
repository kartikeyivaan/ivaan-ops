import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canViewInventory,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import { getIncomingLotRecordedSerials, getLotById } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toSafeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewInventory(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }
  if (!canViewSerialNumbers(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission to view serial numbers.", 403);
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

  const pendingQty =
    Number(lot.quantity) - Number(lot.receivedQuantity) - Number(lot.damagedQuantity);
  const recordedSerials = await getIncomingLotRecordedSerials(prisma, lot);
  const serialRows = recordedSerials.map((serial, index) => [
    index + 1,
    serial.serialNumber,
    formatDate(serial.createdAt),
    serial.status,
    serial.stillOnLot ? lot.lotNumber : serial.currentLotNumber,
  ]);

  const detailRows: (string | number)[][] = [
    ["Incoming Lot Details", ""],
    ["Lot Number", lot.lotNumber],
    ["Company", lot.company.code],
    ["Product", lot.product.displayName],
    ["Brand", lot.product.brand.name],
    ["Category", lot.product.category.name],
    ["Warehouse", lot.warehouse.name],
    ["Vendor", lot.vendor?.vendorName ?? ""],
    ["Purchase Invoice No", lot.purchaseInvoiceNo],
    ["Purchase Date", formatDate(lot.purchaseDate)],
    ["Lot Purchased Qty", Number(lot.quantity)],
    ["Received Qty", Number(lot.receivedQuantity)],
    ["Damaged Qty", Number(lot.damagedQuantity)],
    ["Pending Qty", pendingQty],
    ["Serials in this file", recordedSerials.length],
    ["Status", lot.status],
    [],
    ["Recorded Serial Numbers", ""],
    ["#", "Serial Number", "Recorded Date", "Serial Status", "Current Lot"],
  ];

  const listSheet = XLSX.utils.aoa_to_sheet([
    ["#", "Serial Number", "Recorded Date", "Serial Status", "Current Lot"],
    ...(serialRows.length > 0 ? serialRows : [["", "No serial numbers recorded yet.", "", "", ""]]),
  ]);
  listSheet["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 20 }, { wch: 18 }, { wch: 22 }];

  const worksheet = XLSX.utils.aoa_to_sheet([
    ...detailRows,
    ...(serialRows.length > 0 ? serialRows : [["", "No serial numbers recorded yet.", "", "", ""]]),
  ]);

  worksheet["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 20 }, { wch: 18 }, { wch: 22 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, listSheet, "Serial list");
  XLSX.utils.book_append_sheet(workbook, worksheet, "Lot details");

  const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  const filename = `incoming-serials-${toSafeFilenamePart(lot.lotNumber)}-${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
