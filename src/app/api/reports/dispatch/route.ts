import { canViewDispatchReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getDispatchReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewDispatchReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getDispatchReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserId: filters!.salesUserId,
    warehouseId: filters!.warehouseId,
    customerId: filters!.customerId,
    q: filters!.q,
  });

  return respondWithReport({
    reportKey: "dispatch",
    title: "Dispatch Report",
    subtitle: [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to "),
    rows,
    format: format!,
    columns: [
      { key: "dcNo", header: "DC No" },
      { key: "piNo", header: "PI No" },
      { key: "customerName", header: "Customer" },
      { key: "executiveName", header: "Executive" },
      { key: "productName", header: "Product" },
      { key: "qty", header: "Qty" },
      { key: "dispatchDate", header: "Dispatch Date" },
      { key: "vehicleNo", header: "Vehicle" },
      { key: "warehouseName", header: "Warehouse" },
      { key: "value", header: "Value" },
    ],
    pdfColumns: [
      { header: "DC No", width: 90 },
      { header: "PI No", width: 90 },
      { header: "Customer", width: 110 },
      { header: "Product", width: 120 },
      { header: "Qty", width: 45, align: "right" },
      { header: "Date", width: 70 },
      { header: "Value", width: 80, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.dcNo),
      String(row.piNo),
      String(row.customerName),
      String(row.productName),
      String(row.qty),
      String(row.dispatchDate),
      formatCurrency(Number(row.value)),
    ],
  });
}
