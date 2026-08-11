import { canViewReservedQtyReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getReservedQtyReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewReservedQtyReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getReservedQtyReport(prisma, companyId!, {
    productId: filters!.productId,
    warehouseId: filters!.warehouseId,
    q: filters!.q,
  });

  return respondWithReport({
    reportKey: "reserved-qty",
    title: "Reserved Qty by Product",
    rows,
    format: format!,
    columns: [
      { key: "committedDate", header: "Committed Date" },
      { key: "customerName", header: "Customer Name" },
      { key: "productName", header: "Product" },
      { key: "piNo", header: "PI No" },
      { key: "totalQty", header: "Total Qty" },
      { key: "totalAmount", header: "Total Amount" },
      { key: "ratePerWp", header: "Rate (per Wp)" },
      { key: "bookingAmount", header: "Booking Amount" },
    ],
    pdfColumns: [
      { header: "Committed", width: 70 },
      { header: "Customer", width: 110 },
      { header: "Product", width: 110 },
      { header: "Qty", width: 45, align: "right" },
      { header: "Amount", width: 70, align: "right" },
      { header: "Rate/Wp", width: 55, align: "right" },
      { header: "Booking", width: 70, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.committedDate),
      String(row.customerName),
      String(row.productName),
      String(row.totalQty),
      formatCurrency(Number(row.totalAmount)),
      formatCurrency(Number(row.ratePerWp)),
      formatCurrency(Number(row.bookingAmount)),
    ],
  });
}
