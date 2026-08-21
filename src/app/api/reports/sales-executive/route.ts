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
      { key: "quotationValueActual", header: "Quotation Actual" },
      { key: "quotationValue", header: "Quotation Counted" },
      { key: "piValueActual", header: "PI Actual" },
      { key: "piValue", header: "PI Counted" },
      { key: "collectionValueActual", header: "Collection Actual" },
      { key: "collectionValue", header: "Collection Counted" },
      { key: "dispatchedValueActual", header: "Dispatch Actual" },
      { key: "dispatchedValue", header: "Dispatch Counted" },
      { key: "newCustomersActual", header: "New Customers Actual" },
      { key: "newCustomers", header: "New Customers Counted" },
    ],
    pdfColumns: [
      { header: "Executive", width: 110 },
      { header: "Quot A/C", width: 85, align: "right" },
      { header: "PI A/C", width: 85, align: "right" },
      { header: "Coll A/C", width: 85, align: "right" },
      { header: "Disp A/C", width: 85, align: "right" },
      { header: "Cust A/C", width: 60, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.executiveName),
      `${formatCurrency(Number(row.quotationValueActual))} / ${formatCurrency(Number(row.quotationValue))}`,
      `${formatCurrency(Number(row.piValueActual))} / ${formatCurrency(Number(row.piValue))}`,
      `${formatCurrency(Number(row.collectionValueActual))} / ${formatCurrency(Number(row.collectionValue))}`,
      `${formatCurrency(Number(row.dispatchedValueActual))} / ${formatCurrency(Number(row.dispatchedValue))}`,
      `${row.newCustomersActual} / ${row.newCustomers}`,
    ],
  });
}
