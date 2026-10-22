import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewQuotations } from "@/lib/quotation-permissions";
import { generateQuotationPdf } from "@/lib/quotation-pdf";
import { quotationPdfContentVersion } from "@/lib/pdf-content-versions";
import { pdfInlineResponse, resolveStoredPdf } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";
import { quotationInclude } from "@/lib/quotation-service";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewQuotations(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const quotation = await prisma.quotation.findFirst({
    where: { id, companyId },
    include: quotationInclude,
  });

  if (!quotation) {
    return errorResponse("NOT_FOUND", "Quotation not found.", 404);
  }

  const pdf = await resolveStoredPdf(prisma, {
    documentType: "QUOTATION",
    documentId: quotation.id,
    contentVersion: quotationPdfContentVersion(quotation),
    generate: () => generateQuotationPdf(quotation),
  });

  const rawName = `${quotation.quotationNo} - ${quotation.customer.customerName}`;
  const safeName = rawName.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();

  return pdfInlineResponse(pdf, safeName, {
    asciiName: safeName.replace(/[^\x20-\x7E]/g, "_"),
  });
}
