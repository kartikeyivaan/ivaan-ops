import { canViewDispatchProfitReport } from "@/lib/report-permissions";
import { parseReportRequest, reportError, respondWithReport } from "@/lib/report-api";
import { getDispatchProfitReport } from "@/lib/report-service";
import { formatCurrency } from "@/lib/quotations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const parsed = await parseReportRequest(request);
  if ("error" in parsed && parsed.error) return parsed.error;

  const { session, companyId, filters, format } = parsed;
  if (!canViewDispatchProfitReport(session!.user.roles)) {
    return reportError("FORBIDDEN", "You do not have permission for this report.", 403);
  }

  const rows = await getDispatchProfitReport(prisma, companyId!, {
    fromDate: filters!.fromDate,
    toDate: filters!.toDate,
    salesUserId: filters!.salesUserId,
    warehouseId: filters!.warehouseId,
    customerId: filters!.customerId,
    q: filters!.q,
  });

  const dateLabel =
    filters!.fromDate && filters!.toDate && filters!.fromDate === filters!.toDate
      ? filters!.fromDate
      : [filters!.fromDate, filters!.toDate].filter(Boolean).join(" to ");

  return respondWithReport({
    reportKey: "dispatch-profit",
    title: "Dispatch Profit Report (ex-GST)",
    subtitle: dateLabel,
    rows,
    format: format!,
    columns: [
      { key: "dispatchDate", header: "Dispatch Date" },
      { key: "dcNo", header: "DC No" },
      { key: "piNo", header: "PI No" },
      { key: "executiveName", header: "Executive" },
      { key: "customerName", header: "Customer" },
      { key: "productName", header: "Product" },
      { key: "qty", header: "Qty" },
      { key: "serialNumbers", header: "Serial Numbers" },
      { key: "warehouseName", header: "Warehouse" },
      { key: "revenueExGst", header: "Revenue (ex-GST)" },
      { key: "cogsExGst", header: "COGS (ex-GST)" },
      { key: "profitExGst", header: "Profit (ex-GST)" },
      { key: "marginPercent", header: "Margin %" },
      { key: "costSource", header: "Cost Source" },
    ],
    pdfColumns: [
      { header: "DC No", width: 60 },
      { header: "PI No", width: 60 },
      { header: "Customer", width: 90 },
      { header: "Product", width: 90 },
      { header: "Qty", width: 35, align: "right" },
      { header: "Revenue", width: 60, align: "right" },
      { header: "COGS", width: 60, align: "right" },
      { header: "Profit", width: 60, align: "right" },
      { header: "Margin %", width: 50, align: "right" },
    ],
    toPdfRow: (row) => [
      String(row.dcNo),
      String(row.piNo),
      String(row.customerName),
      String(row.productName),
      String(row.qty),
      row.revenueExGst === null ? "—" : formatCurrency(Number(row.revenueExGst)),
      row.cogsExGst === null ? "—" : formatCurrency(Number(row.cogsExGst)),
      row.profitExGst === null ? "—" : formatCurrency(Number(row.profitExGst)),
      row.marginPercent === null ? "—" : `${Number(row.marginPercent).toFixed(2)}%`,
    ],
  });
}
