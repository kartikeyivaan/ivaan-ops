import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { regenerateStoredPdf, StoredPdfRegenerateError } from "@/lib/stored-pdf-regenerate";
import { regenerateStoredPdfSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = regenerateStoredPdfSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid regenerate request.", 400);
  }

  try {
    const result = await regenerateStoredPdf(prisma, {
      companyId,
      documentType: parsed.data.documentType,
      documentId: parsed.data.documentId,
      variant: parsed.data.variant,
      userRoles: session.user.roles,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof StoredPdfRegenerateError) {
      return errorResponse(error.code, error.message, error.code === "NOT_FOUND" ? 404 : 403);
    }
    throw error;
  }
}
