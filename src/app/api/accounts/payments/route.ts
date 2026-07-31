import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewPiPayments } from "@/lib/accounts-permissions";
import { listPiPayments } from "@/lib/accounts-payments-service";
import { prisma } from "@/lib/prisma";
import {
  defaultPaymentsDateRange,
  formatPaymentMode,
  formatReceivedInAccount,
} from "@/lib/proforma-invoices";
import { buildExcelBuffer, exportFilename } from "@/lib/report-export";
import { requireActiveCompany } from "@/lib/session";

function error(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewPiPayments(session.user.roles)) {
    return error("Forbidden.", 403);
  }

  const companyId = requireActiveCompany(session);
  const params = new URL(request.url).searchParams;
  const defaults = defaultPaymentsDateRange();
  const filters = {
    q: params.get("q")?.trim() || undefined,
    dateFrom: params.get("dateFrom")?.trim() || defaults.dateFrom,
    dateTo: params.get("dateTo")?.trim() || defaults.dateTo,
  };

  const rows = await listPiPayments(prisma, companyId, filters);

  if (params.get("format") === "xlsx") {
    const exportRows = rows.map((row, index) => ({
      serial: index + 1,
      paymentDate: row.paymentDate,
      customerName: row.customer.customerName,
      customerCode: row.customer.customerCode,
      piNo: row.proformaInvoice.piNo,
      piValue: row.proformaInvoice.totalValue,
      amount: row.amount,
      paymentMode: formatPaymentMode(row.paymentMode),
      receivedInAccount: row.receivedInAccount
        ? formatReceivedInAccount(row.receivedInAccount)
        : "",
      referenceNo: row.referenceNo ?? "",
      notes: row.notes ?? "",
      recordedBy: row.recordedBy.name,
    }));

    const buffer = buildExcelBuffer(exportRows, "PI Payments", [
      { key: "serial", header: "#" },
      { key: "paymentDate", header: "Payment Date" },
      { key: "customerName", header: "Customer Name" },
      { key: "customerCode", header: "Customer Code" },
      { key: "piNo", header: "PI #" },
      { key: "piValue", header: "PI Value" },
      { key: "amount", header: "Amount Received" },
      { key: "paymentMode", header: "Payment Mode" },
      { key: "receivedInAccount", header: "Received In" },
      { key: "referenceNo", header: "Reference No" },
      { key: "notes", header: "Notes" },
      { key: "recordedBy", header: "Recorded By" },
    ]);

    const filename = exportFilename("pi-payments", "xlsx");
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({
    items: rows,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
  });
}
