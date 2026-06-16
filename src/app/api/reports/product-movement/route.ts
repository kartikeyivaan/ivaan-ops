import { canViewProductMovementReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getProductMovementReport } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewProductMovementReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getProductMovementReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    warehouseId: filters!.warehouseId,
    productId: filters!.productId,
    q: filters!.q,
  });

  return respondWithReport({
    reportKey: "product-movement",
    title: "Product Movement Report",
    subtitle: [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to "),
    rows,
    format: format!,
    columns: [
      { key: "productName", header: "Product" },
      { key: "brandName", header: "Brand" },
      { key: "warehouseName", header: "Warehouse" },
      { key: "opening", header: "Opening" },
      { key: "incoming", header: "Incoming" },
      { key: "transfersIn", header: "Transfers In" },
      { key: "booked", header: "Booked" },
      { key: "dispatched", header: "Dispatched" },
      { key: "damaged", header: "Damaged" },
      { key: "transfersOut", header: "Transfers Out" },
      { key: "closing", header: "Closing" },
    ],
    pdfColumns: [
      { header: "Product", width: 130 },
      { header: "Warehouse", width: 90 },
      { header: "Open", width: 45, align: "right" },
      { header: "In", width: 45, align: "right" },
      { header: "Book", width: 45, align: "right" },
      { header: "Disp", width: 45, align: "right" },
      { header: "Close", width: 45, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.productName),
      String(row.warehouseName),
      String(row.opening),
      String(row.incoming),
      String(row.booked),
      String(row.dispatched),
      String(row.closing),
    ],
  });
}
