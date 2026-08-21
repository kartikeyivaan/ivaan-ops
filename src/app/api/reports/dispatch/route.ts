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

  const dateLabel =
    filters!.fromDate && filters!.toDate && filters!.fromDate === filters!.toDate
      ? filters!.fromDate
      : [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to ");

  return respondWithReport({
    reportKey: "daily-dispatch",
    title: "Daily Dispatch Report",
    subtitle: dateLabel,
    rows,
    format: format!,
    columns: [
      { key: "dispatchDate", header: "Dispatch Date" },
      { key: "dcNo", header: "DC No" },
      { key: "piNo", header: "PI No" },
      { key: "piDate", header: "PI Date" },
      { key: "firmName", header: "Firm Name" },
      { key: "firmCode", header: "Firm Code" },
      { key: "firmGst", header: "Firm GST" },
      { key: "firmAddress", header: "Firm Address" },
      { key: "firmMobile", header: "Firm Mobile" },
      { key: "executiveName", header: "Executive" },
      { key: "productName", header: "Product" },
      { key: "qty", header: "Qty" },
      { key: "serialNumbers", header: "Serial Numbers" },
      { key: "vehicleNo", header: "Vehicle" },
      { key: "warehouseName", header: "Warehouse" },
      { key: "value", header: "Value" },
    ],
    pdfColumns: [
      { header: "DC No", width: 70 },
      { header: "PI No", width: 70 },
      { header: "Firm", width: 100 },
      { header: "Product", width: 100 },
      { header: "Qty", width: 40, align: "right" },
      { header: "Serials", width: 120 },
      { header: "Value", width: 70, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.dcNo),
      String(row.piNo),
      String(row.firmName),
      String(row.productName),
      String(row.qty),
      String(row.serialNumbers || "—"),
      formatCurrency(Number(row.value)),
    ],
  });
}
