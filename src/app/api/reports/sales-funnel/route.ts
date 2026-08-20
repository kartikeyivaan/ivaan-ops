import { canViewSalesFunnelReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getSalesFunnelReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewSalesFunnelReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getSalesFunnelReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserId: filters!.salesUserId,
    customerType: filters!.customerType,
  });

  return respondWithReport({
    reportKey: "sales-funnel",
    title: "Sales Funnel Report",
    subtitle: [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to "),
    rows,
    format: format!,
    columns: [
      { key: "stage", header: "Stage" },
      { key: "value", header: "Value" },
      { key: "conversionPercent", header: "Conversion %" },
    ],
    pdfColumns: [
      { header: "Stage", width: 120 },
      { header: "Value", width: 100, align: "right" },
      { header: "Conversion %", width: 90, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.stage),
      formatCurrency(Number(row.value)),
      row.conversionPercent == null ? "—" : `${row.conversionPercent}%`,
    ],
  });
}
