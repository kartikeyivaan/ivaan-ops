import { canViewSalesExecutiveReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getSalesExecutiveReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewSalesExecutiveReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getSalesExecutiveReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserId: filters!.salesUserId,
    customerType: filters!.customerType,
  });

  return respondWithReport({
    reportKey: "sales-executive",
    title: "Sales Executive Report",
    subtitle: [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to "),
    rows,
    format: format!,
    columns: [
      { key: "executiveName", header: "Executive" },
      { key: "quotationValue", header: "Quotation Value" },
      { key: "piValue", header: "PI Value" },
      { key: "collectionValue", header: "Collection Value" },
      { key: "dispatchedValue", header: "Dispatched Value" },
      { key: "newCustomers", header: "New Customers" },
    ],
    pdfColumns: [
      { header: "Executive", width: 120 },
      { header: "Quotation", width: 90, align: "right" },
      { header: "PI", width: 90, align: "right" },
      { header: "Collection", width: 90, align: "right" },
      { header: "Dispatched", width: 90, align: "right" },
      { header: "Customers", width: 70, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.executiveName),
      formatCurrency(Number(row.quotationValue)),
      formatCurrency(Number(row.piValue)),
      formatCurrency(Number(row.collectionValue)),
      formatCurrency(Number(row.dispatchedValue)),
      String(row.newCustomers),
    ],
  });
}
