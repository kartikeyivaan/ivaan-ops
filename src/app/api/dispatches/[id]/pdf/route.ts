import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewDispatches } from "@/lib/dispatch-permissions";
import { generateDispatchPdf } from "@/lib/dispatch-pdf";
import { getDispatchRecord } from "@/lib/dispatch-service";
import { pdfContentVersion, pdfInlineResponse, resolveStoredPdf } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const dispatch = await getDispatchRecord(prisma, companyId, id);
  if (!dispatch) {
    return errorResponse("NOT_FOUND", "Dispatch not found.", 404);
  }
  if (dispatch.status === "DRAFT") {
    return errorResponse("INVALID_STATUS", "Confirm dispatch before generating DC PDF.", 400);
  }

  const pdf = await resolveStoredPdf(prisma, {
    documentType: "DISPATCH",
    documentId: dispatch.id,
    contentVersion: pdfContentVersion([dispatch.updatedAt.toISOString(), dispatch.status]),
    generate: () => generateDispatchPdf(dispatch),
  });

  return pdfInlineResponse(pdf, dispatch.dcNo);
}
