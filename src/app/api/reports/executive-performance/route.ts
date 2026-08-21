import { canViewExecutivePerformanceReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getExecutivePerformanceReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewExecutivePerformanceReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getExecutivePerformanceReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserId: filters!.salesUserId,
    customerType: filters!.customerType,
  });

  return respondWithReport({
    reportKey: "executive-performance",
    title: "Executive Performance Report",
    subtitle: [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to "),
    rows,
    format: format!,
    columns: [
      { key: "executiveName", header: "Executive" },
      { key: "targetModules", header: "Target Modules" },
      { key: "achievedModules", header: "Achieved Modules (Counted)" },
      { key: "targetProgressPercent", header: "Target %" },
      { key: "masteryLevel", header: "Mastery Level" },
      { key: "modulesDispatchedThisMonth", header: "Modules Month (Counted)" },
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
      { key: "newCustomersActual", header: "New Customers Actual" },
      { key: "newCustomers", header: "New Customers Counted" },
    ],
    pdfColumns: [
      { header: "Executive", width: 90 },
      { header: "Target", width: 45, align: "right" },
      { header: "Achieved", width: 50, align: "right" },
      { header: "Target %", width: 50, align: "right" },
      { header: "Mastery", width: 80 },
      { header: "Quot A/C", width: 70, align: "right" },
      { header: "PI A/C", width: 70, align: "right" },
      { header: "Coll A/C", width: 70, align: "right" },
      { header: "Disp A/C", width: 70, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.executiveName),
      String(row.targetModules),
      String(row.achievedModules),
      `${row.targetProgressPercent}%`,
      String(row.masteryLevel),
      `${formatCurrency(Number(row.quotationValueActual))} / ${formatCurrency(Number(row.quotationValue))}`,
      `${formatCurrency(Number(row.piValueActual))} / ${formatCurrency(Number(row.piValue))}`,
      `${formatCurrency(Number(row.collectionValueActual))} / ${formatCurrency(Number(row.collectionValue))}`,
      `${formatCurrency(Number(row.dispatchedValueActual))} / ${formatCurrency(Number(row.dispatchedValue))}`,
    ],
  });
}
