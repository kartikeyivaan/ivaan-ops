import { canViewCustomerSalesRevenueReport } from "@/lib/report-permissions";
import {
  parseReportRequest,
  reportError,
  resolveReportCompanyIds,
  respondWithReport,
} from "@/lib/report-api";
import { getCustomerSalesRevenueReport } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, filters, format } = parsed;
  if (!canViewCustomerSalesRevenueReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "Super Admin access required for this report.", 403);
  }

  const companyIds = await resolveReportCompanyIds(
    session!,
    filters!.companyIds,
    prisma,
  );
  if (!Array.isArray(companyIds)) {
    return companyIds;
  }

  const rows = await getCustomerSalesRevenueReport(prisma, companyIds, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserIds: filters!.salesUserIds,
  });

  const subtitle = [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to ");

  return respondWithReport({
    reportKey: "customer-sales-revenue",
    title: "Customer Sales Revenue",
    subtitle,
    rows,
    format: format!,
    columns: [
      { key: "srNo", header: "Sr Number" },
      { key: "customerCode", header: "Customer Code" },
      { key: "customerName", header: "Customer Name" },
      { key: "customerType", header: "Customer Type" },
      { key: "salesExecutive", header: "Sales Executive" },
      { key: "salesRevenue", header: "Sales Revenue" },
      { key: "dispatchCount", header: "Dispatch Count" },
      { key: "city", header: "City" },
      { key: "state", header: "State" },
      { key: "mobile", header: "Mobile" },
    ],
    pdfColumns: [
      { header: "Sr", width: 28, align: "right" },
      { header: "Code", width: 55 },
      { header: "Customer", width: 95 },
      { header: "Type", width: 45 },
      { header: "SE", width: 80 },
      { header: "Revenue", width: 65, align: "right" },
      { header: "DCs", width: 35, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.srNo),
      String(row.customerCode),
      String(row.customerName),
      String(row.customerType),
      String(row.salesExecutive),
      String(row.salesRevenue),
      String(row.dispatchCount),
    ],
  });
}
