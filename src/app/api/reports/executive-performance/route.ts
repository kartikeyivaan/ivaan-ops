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
      { key: "achievedModules", header: "Achieved Modules" },
      { key: "targetProgressPercent", header: "Target %" },
      { key: "masteryLevel", header: "Mastery Level" },
      { key: "modulesDispatchedThisMonth", header: "Modules (Month)" },
      { key: "quotationValue", header: "Quotation Value" },
      { key: "piValue", header: "PI Value" },
      { key: "collectionValue", header: "Collection Value" },
      { key: "dispatchedValue", header: "Dispatched Value" },
      { key: "moduleUnits", header: "Module Units" },
      { key: "newCustomers", header: "New Customers" },
    ],
    pdfColumns: [
      { header: "Executive", width: 90 },
      { header: "Target", width: 45, align: "right" },
      { header: "Achieved", width: 50, align: "right" },
      { header: "Target %", width: 50, align: "right" },
      { header: "Mastery", width: 80 },
      { header: "Quotation", width: 70, align: "right" },
      { header: "PI", width: 70, align: "right" },
      { header: "Collection", width: 70, align: "right" },
      { header: "Dispatch", width: 70, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.executiveName),
      String(row.targetModules),
      String(row.achievedModules),
      `${row.targetProgressPercent}%`,
      String(row.masteryLevel),
      formatCurrency(Number(row.quotationValue)),
      formatCurrency(Number(row.piValue)),
      formatCurrency(Number(row.collectionValue)),
      formatCurrency(Number(row.dispatchedValue)),
    ],
  });
}
