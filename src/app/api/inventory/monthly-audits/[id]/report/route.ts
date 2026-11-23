import * as XLSX from "xlsx";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  canManageMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { getMonthlyAuditReconciliation } from "@/lib/monthly-serial-audit-approve";
import { listInvestigation } from "@/lib/monthly-serial-audit-investigation";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** GET: Excel report with Missing, Additional and section B sheets (Super Admin). */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  try {
    const data = await getMonthlyAuditReconciliation(prisma, id);
    const workbook = XLSX.utils.book_new();

    const summary = [
      { Item: "Audit number", Value: data.audit.auditNumber },
      { Item: "Status", Value: data.audit.status },
      { Item: "Serials expected", Value: data.serial.expected },
      { Item: "Serials found", Value: data.serial.found },
      { Item: "Missing serials", Value: data.serial.missing.length },
      { Item: "Additional serials", Value: data.serial.additional.length },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "Summary");

    const missing = data.serial.missing.map((f) => ({
      "Serial number": f.serialNumber,
      Product: f.product?.displayName ?? "",
      "Investigation note": f.investigationNote ?? "",
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(missing.length ? missing : [{ "Serial number": "" }]),
      "Missing",
    );

    const additional = data.serial.additional.map((f) => ({
      "Serial number": f.serialNumber,
      "Investigation note": f.investigationNote ?? "",
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(additional.length ? additional : [{ "Serial number": "" }]),
      "Additional",
    );

    const qty = data.qty.map((line) => ({
      Company: line.company.name,
      Warehouse: line.warehouse.name,
      Product: line.product.displayName,
      "Record qty": line.recordQty ?? "",
      "Audit qty": line.auditQty ?? "",
      Variance: line.varianceQty ?? "",
      Approved: line.approved ? "Yes" : "No",
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(qty.length ? qty : [{ Company: "" }]),
      "Non-serialized",
    );

    // Investigation outcome: one row per serial with its current status and resolution.
    const investigation = [
      ...(await listInvestigation(prisma, id, "MISSING")).map((r) => ({ ...r, Type: "Missing" })),
      ...(await listInvestigation(prisma, id, "ADDITIONAL")).map((r) => ({ ...r, Type: "New addition" })),
    ].map((r) => ({
      Type: r.Type,
      "Serial number": r.serialNumber,
      Product: r.product,
      Company: r.company,
      Warehouse: r.warehouse,
      "Current status": r.serialStatus ?? "Not in system",
      Resolution: r.resolution ?? "Open",
      Note: r.resolutionNote ?? "",
      "Resolved at": r.resolvedAt ?? "",
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(investigation.length ? investigation : [{ Type: "" }]),
      "Investigation",
    );

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${data.audit.auditNumber}.xlsx"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return auditErrorResponse("NOT_FOUND", "Monthly audit not found.", 404);
    }
    return mapMonthlyAuditError(error, "Failed to build report.");
  }
}
