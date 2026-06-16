import { canViewPaymentFollowupReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getPaymentFollowupReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewPaymentFollowupReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getPaymentFollowupReport(prisma, companyId!, {
    salesUserId: filters!.salesUserId,
    customerId: filters!.customerId,
    ageingBucket: filters!.ageingBucket,
  });

  return respondWithReport({
    reportKey: "payment-followup",
    title: "Payment Follow-up Report",
    rows,
    format: format!,
    columns: [
      { key: "customerName", header: "Customer" },
      { key: "piNo", header: "PI No" },
      { key: "piDate", header: "PI Date" },
      { key: "piValue", header: "PI Value" },
      { key: "paid", header: "Paid" },
      { key: "outstanding", header: "Outstanding" },
      { key: "ageingDays", header: "Ageing (Days)" },
      { key: "ageingBucket", header: "Ageing Bucket" },
      { key: "salesExecutive", header: "Sales Executive" },
    ],
    pdfColumns: [
      { header: "Customer", width: 120 },
      { header: "PI No", width: 90 },
      { header: "Date", width: 70 },
      { header: "PI Value", width: 80, align: "right" },
      { header: "Paid", width: 70, align: "right" },
      { header: "Outstanding", width: 80, align: "right" },
      { header: "Age", width: 50, align: "right" },
      { header: "Executive", width: 100 },
    ],
    toPdfRow: (row) => [
      String(row.customerName),
      String(row.piNo),
      String(row.piDate),
      formatCurrency(Number(row.piValue)),
      formatCurrency(Number(row.paid)),
      formatCurrency(Number(row.outstanding)),
      String(row.ageingDays),
      String(row.salesExecutive),
    ],
  });
}
