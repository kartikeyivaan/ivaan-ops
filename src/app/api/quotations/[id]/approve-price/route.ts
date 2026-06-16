import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canApproveQuotationPricing,
} from "@/lib/quotation-permissions";
import { approveQuotationPricing } from "@/lib/quotation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { approveQuotationPriceSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApproveQuotationPricing(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = approveQuotationPriceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid approval data.", 400, parsed.error.flatten());
  }

  const { id } = await context.params;

  try {
    const quotation = await approveQuotationPricing(prisma, {
      companyId,
      quotationId: id,
      approvedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(quotation);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Quotation not found.", 404);
      }
      if (error.message === "NO_PENDING_APPROVAL") {
        return errorResponse("VALIDATION_ERROR", "No pending price approval on this quotation.", 400);
      }
    }
    throw error;
  }
}
