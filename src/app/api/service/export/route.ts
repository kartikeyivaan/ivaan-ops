import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildExcelBuffer, exportFilename } from "@/lib/report-export";
import {
  SERVICE_PRIORITY_LABELS,
  SERVICE_STATUS_LABELS,
} from "@/lib/service";
import { canExportService } from "@/lib/service-permissions";
import { resolveServiceAccess, serviceError } from "@/lib/service-api";
import { listServiceRequestsForExport } from "@/lib/service-service";

function formatDate(value: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canExportService(session.user.roles)) {
    return serviceError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const access = await resolveServiceAccess(session);
  if (!access.ok) return access.response;

  const requests = await listServiceRequestsForExport(
    prisma,
    access.companyId,
    access.restrictToUserId,
  );

  const rows = requests.map((r, index) => ({
    serial: index + 1,
    number: r.serviceRequestNumber,
    date: formatDate(r.requestDate),
    customerName: r.customerName,
    mobileNumber: r.mobileNumber ?? "",
    consumerNumber: r.consumerNumber ?? "",
    workType: r.workType?.name ?? r.customWorkType ?? "",
    customerRequest: r.customerRequest,
    status: SERVICE_STATUS_LABELS[r.status] ?? r.status,
    priority: SERVICE_PRIORITY_LABELS[r.priority] ?? r.priority,
    assignedTo: r.assignedTo?.name ?? "",
    fees: r.totalFees,
    amountReceived: r.amountReceived,
    pendingAmount: r.pendingAmount,
    delayDays: r.delayDays,
    targetDate: formatDate(r.targetCompletionDate),
    completionDate: formatDate(r.completionDate),
  }));

  const buffer = buildExcelBuffer(rows, "Service Requests", [
    { key: "serial", header: "#" },
    { key: "number", header: "Request No" },
    { key: "date", header: "Date" },
    { key: "customerName", header: "Customer Name" },
    { key: "mobileNumber", header: "Mobile Number" },
    { key: "consumerNumber", header: "Consumer #" },
    { key: "workType", header: "Work Type" },
    { key: "customerRequest", header: "Customer Request" },
    { key: "status", header: "Status" },
    { key: "priority", header: "Priority" },
    { key: "assignedTo", header: "Assigned To" },
    { key: "fees", header: "Fees" },
    { key: "amountReceived", header: "Amount Received" },
    { key: "pendingAmount", header: "Pending Amount" },
    { key: "delayDays", header: "Delay Days" },
    { key: "targetDate", header: "Target Date" },
    { key: "completionDate", header: "Completion Date" },
  ]);

  const filename = exportFilename("service-requests", "xlsx");

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
