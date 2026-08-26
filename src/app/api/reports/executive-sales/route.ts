import { canViewExecutiveSalesReport } from "@/lib/report-permissions";
import {
  parseReportRequest,
  reportError,
  resolveReportCompanyIds,
  respondWithReport,
} from "@/lib/report-api";
import { getExecutiveSalesReport } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, filters, format } = parsed;
  if (!canViewExecutiveSalesReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const companyIds = await resolveReportCompanyIds(
    session!,
    filters!.companyIds,
    prisma,
  );
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
      { key: "companyName", header: "Company Name" },
      { key: "productName", header: "Product Name" },
      { key: "qty", header: "Qty" },
      { key: "piNumber", header: "PI Number" },
      { key: "dcNumber", header: "DC Number" },
    ],
    pdfColumns: [
      { header: "Sr", width: 28, align: "right" },
      { header: "Date", width: 55 },
      { header: "SE Name", width: 80 },
      { header: "Company", width: 95 },
      { header: "Product", width: 90 },
      { header: "Qty", width: 35, align: "right" },
      { header: "PI No", width: 65 },
      { header: "DC No", width: 65 },
    ],
    toPdfRow: (row) => [
      String(row.srNo),
      String(row.date),
      String(row.seName),
      String(row.companyName),
      String(row.productName),
      String(row.qty),
      String(row.piNumber),
      String(row.dcNumber),
    ],
  });
}
