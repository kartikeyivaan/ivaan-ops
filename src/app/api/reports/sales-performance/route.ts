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

  const rows = (
    await getSalesPerformanceReport(prisma, companyId!, {
      fromDate: filters!.fromDate,
      toDate: filters!.toDate,
      salesUserId: filters!.salesUserId,
      customerType: filters!.customerType,
    })
  ).map((row) => ({
    executiveName: row.executiveName,
    quotationValueActual: row.quotationValue.actual,
    quotationValue: row.quotationValue.counted,
    piValueActual: row.piValue.actual,
    piValue: row.piValue.counted,
    collectionValueActual: row.collectionValue.actual,
    collectionValue: row.collectionValue.counted,
    dispatchedValueActual: row.dispatchedValue.actual,
    dispatchedValue: row.dispatchedValue.counted,
    moduleUnitsActual: row.moduleUnits.actual,
    moduleUnits: row.moduleUnits.counted,
    inverterUnitsActual: row.inverterUnits.actual,
    inverterUnits: row.inverterUnits.counted,
    otherUnitsActual: row.otherUnits.actual,
    otherUnits: row.otherUnits.counted,
    newCustomersActual: row.newCustomers.actual,
    newCustomers: row.newCustomers.counted,
  }));

  return respondWithReport({
    reportKey: "sales-performance",
    title: "Sales Performance Report",
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
      { key: "moduleUnitsActual", header: "Modules Actual" },
      { key: "moduleUnits", header: "Modules Counted" },
      { key: "inverterUnitsActual", header: "Inverters Actual" },
      { key: "inverterUnits", header: "Inverters Counted" },
      { key: "otherUnitsActual", header: "Other Actual" },
      { key: "otherUnits", header: "Other Counted" },
      { key: "newCustomersActual", header: "New Customers Actual" },
      { key: "newCustomers", header: "New Customers Counted" },
    ],
    pdfColumns: [
      { header: "Executive", width: 90 },
      { header: "Quot A/C", width: 70, align: "right" },
      { header: "PI A/C", width: 70, align: "right" },
      { header: "Coll A/C", width: 70, align: "right" },
      { header: "Disp A/C", width: 70, align: "right" },
      { header: "Mod A/C", width: 55, align: "right" },
      { header: "Cust A/C", width: 55, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.executiveName),
      `${formatCurrency(Number(row.quotationValueActual))} / ${formatCurrency(Number(row.quotationValue))}`,
      `${formatCurrency(Number(row.piValueActual))} / ${formatCurrency(Number(row.piValue))}`,
      `${formatCurrency(Number(row.collectionValueActual))} / ${formatCurrency(Number(row.collectionValue))}`,
      `${formatCurrency(Number(row.dispatchedValueActual))} / ${formatCurrency(Number(row.dispatchedValue))}`,
      `${row.moduleUnitsActual} / ${row.moduleUnits}`,
      `${row.newCustomersActual} / ${row.newCustomers}`,
    ],
  });
}
