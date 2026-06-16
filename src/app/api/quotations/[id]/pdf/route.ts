import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewQuotations } from "@/lib/quotation-permissions";
import { generateQuotationPdf } from "@/lib/quotation-pdf";
import { prisma } from "@/lib/prisma";
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
    include: {
      company: {
        select: {
          id: true,
          name: true,
          code: true,
          logoUrl: true,
          digitalSignatureUrl: true,
          bankDetails: true,
          termsAndConditions: true,
        },
      },
      customer: {
        select: {
          id: true,
          customerName: true,
          customerCode: true,
          gstNumber: true,
          address: true,
          city: true,
          state: true,
          mobile: true,
          email: true,
        },
      },
      salesUser: { select: { id: true, name: true, email: true } },
      parentQuotation: {
        select: { id: true, quotationNo: true, revisionNo: true },
      },
      revisions: {
        select: {
          id: true,
          quotationNo: true,
          revisionNo: true,
          status: true,
          createdAt: true,
        },
        orderBy: { revisionNo: "asc" },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              displayName: true,
              pricingType: true,
              capacity: true,
              capacityUnit: true,
              gstRate: true,
              hsn: true,
            },
          },
        },
      },
    },
  });

  if (!quotation) {
    return errorResponse("NOT_FOUND", "Quotation not found.", 404);
  }

  const pdf = await generateQuotationPdf(quotation);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotation.quotationNo}.pdf"`,
    },
  });
}
