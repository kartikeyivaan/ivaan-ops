import { canViewCollectionReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getCollectionReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewCollectionReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getCollectionReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserId: filters!.salesUserId,
    customerId: filters!.customerId,
    ageingBucket: filters!.ageingBucket,
  });

  return respondWithReport({
    reportKey: "collection",
    title: "Collection Report",
    subtitle: [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to "),
    rows,
    format: format!,
    columns: [
      { key: "recordType", header: "Type" },
      { key: "date", header: "Date" },
      { key: "piNo", header: "PI No" },
      { key: "customerName", header: "Customer" },
      { key: "executiveName", header: "Executive" },
      { key: "collectionAmount", header: "Collection" },
      { key: "outstanding", header: "Outstanding" },
      { key: "ageingDays", header: "Ageing Days" },
      { key: "ageingBucket", header: "Ageing Bucket" },
    ],
    pdfColumns: [
      { header: "Type", width: 70 },
      { header: "Date", width: 70 },
      { header: "PI", width: 80 },
      { header: "Customer", width: 110 },
      { header: "Executive", width: 90 },
      { header: "Collection", width: 80, align: "right" },
      { header: "Outstanding", width: 80, align: "right" },
      { header: "Ageing", width: 50, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.recordType),
      String(row.date ?? "—"),
      String(row.piNo ?? "—"),
      String(row.customerName),
      String(row.executiveName),
      row.collectionAmount == null ? "—" : formatCurrency(Number(row.collectionAmount)),
      row.outstanding == null ? "—" : formatCurrency(Number(row.outstanding)),
      row.ageingDays == null ? "—" : String(row.ageingDays),
    ],
  });
}
