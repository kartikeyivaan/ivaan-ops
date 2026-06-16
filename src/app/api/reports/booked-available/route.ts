import { canViewBookedAvailableReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getBookedAvailableReport } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewBookedAvailableReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getBookedAvailableReport(prisma, companyId!, {
    warehouseId: filters!.warehouseId,
    q: filters!.q,
  });

  return respondWithReport({
    reportKey: "booked-available",
    title: "Booked vs Available Stock",
    rows,
    format: format!,
    columns: [
      { key: "productName", header: "Product" },
      { key: "brandName", header: "Brand" },
      { key: "warehouseName", header: "Warehouse" },
      { key: "available", header: "Available" },
      { key: "incoming", header: "Incoming" },
      { key: "booked", header: "Booked" },
      { key: "freeQty", header: "Free Qty" },
    ],
    pdfColumns: [
      { header: "Product", width: 150 },
      { header: "Brand", width: 90 },
      { header: "Warehouse", width: 100 },
      { header: "Available", width: 70, align: "right" },
      { header: "Incoming", width: 70, align: "right" },
      { header: "Booked", width: 70, align: "right" },
      { header: "Free", width: 70, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.productName),
      String(row.brandName),
      String(row.warehouseName),
      String(row.available),
      String(row.incoming),
      String(row.booked),
      String(row.freeQty),
    ],
  });
}
