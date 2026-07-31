import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewProformaInvoices } from "@/lib/pi-permissions";
import { generateProformaInvoicePdf } from "@/lib/pi-pdf";
import { getProformaInvoiceRecord } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewProformaInvoices(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const pi = await getProformaInvoiceRecord(prisma, companyId, id);
  if (!pi) {
    return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
  }
  if (pi.status === "CANCELLED" || pi.status === "CANCEL_PENDING" || pi.status === "DRAFT") {
    return errorResponse("INVALID_STATUS", "PDF is not available for this PI status.", 400);
  }

  const pdf = await generateProformaInvoicePdf(pi);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pi.piNo}.pdf"`,
    },
  });
}
