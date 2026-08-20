import { canViewSalesPerformanceReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getSalesPerformanceReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewSalesPerformanceReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getSalesPerformanceReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserId: filters!.salesUserId,
    customerType: filters!.customerType,
  });

  return respondWithReport({
    reportKey: "sales-performance",
    title: "Sales Performance Report",
    subtitle: [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to "),
    rows,
    format: format!,
    columns: [
      { key: "executiveName", header: "Executive" },
      { key: "quotationValue", header: "Quotation Value" },
      { key: "piValue", header: "PI Value" },
      { key: "collectionValue", header: "Collection Value" },
      { key: "dispatchedValue", header: "Dispatched Value" },
      { key: "moduleUnits", header: "Module Units" },
      { key: "inverterUnits", header: "Inverter Units" },
      { key: "otherUnits", header: "Other Units" },
      { key: "newCustomers", header: "New Customers" },
    ],
    pdfColumns: [
      { header: "Executive", width: 100 },
      { header: "Quotation", width: 75, align: "right" },
      { header: "PI", width: 75, align: "right" },
      { header: "Collection", width: 75, align: "right" },
      { header: "Dispatch", width: 75, align: "right" },
      { header: "Modules", width: 55, align: "right" },
      { header: "Inverters", width: 55, align: "right" },
      { header: "Other", width: 45, align: "right" },
      { header: "Customers", width: 55, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.executiveName),
      formatCurrency(Number(row.quotationValue)),
      formatCurrency(Number(row.piValue)),
      formatCurrency(Number(row.collectionValue)),
      formatCurrency(Number(row.dispatchedValue)),
      String(row.moduleUnits),
      String(row.inverterUnits),
      String(row.otherUnits),
      String(row.newCustomers),
    ],
  });
}
