import { canViewExecutiveSalesReport } from "@/lib/report-permissions";
import {
  parseReportRequest,
  reportError,
  resolveReportScope,
  respondWithReport,
} from "@/lib/report-api";
import { getExecutiveSalesReport } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewExecutiveSalesReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const companyIds = await resolveReportScope(session!, filters!.companyIds, companyId!, prisma);
  if (!Array.isArray(companyIds)) {
    return companyIds;
  }

  const rows = await getExecutiveSalesReport(prisma, companyIds, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserIds: filters!.salesUserIds,
  });

  const subtitle = [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to ");

  return respondWithReport({
    reportKey: "executive-sales",
    title: "Sales Executive Report",
    subtitle,
    rows,
    format: format!,
    columns: [
      { key: "srNo", header: "Sr Number" },
      { key: "date", header: "Date" },
      { key: "seName", header: "SE Name" },
      { key: "sellerCompanyCode", header: "Seller Company Code" },
      { key: "sellerCompanyName", header: "Seller Company" },
      { key: "companyName", header: "Customer Firm" },
      { key: "productName", header: "Product Name" },
      { key: "qty", header: "Qty" },
      { key: "piNumber", header: "PI Number" },
      { key: "dcNumber", header: "DC Number" },
    ],
    pdfColumns: [
      { header: "Sr", width: 25, align: "right" },
      { header: "Date", width: 52 },
      { header: "SE Name", width: 65 },
      { header: "Seller Co.", width: 50 },
      { header: "Customer Firm", width: 80 },
      { header: "Product", width: 75 },
      { header: "Qty", width: 30, align: "right" },
      { header: "PI No", width: 62 },
      { header: "DC No", width: 58 },
    ],
    toPdfRow: (row) => [
      String(row.srNo),
      String(row.date),
      String(row.seName),
      String(row.sellerCompanyCode),
      String(row.companyName),
      String(row.productName),
      String(row.qty),
      String(row.piNumber),
      String(row.dcNumber),
    ],
  });
}
