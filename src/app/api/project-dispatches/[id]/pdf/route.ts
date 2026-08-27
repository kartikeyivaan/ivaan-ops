import { auth } from "@/lib/auth";
import { canViewProjectDispatches } from "@/lib/project-permissions";
import { generateProjectDispatchPdf } from "@/lib/project-dispatch-pdf";
import { getProjectDispatchRecord } from "@/lib/project-dispatch-service";
import { projectDispatchErrorResponse } from "@/lib/project-dispatch-api";
import { pdfContentVersion, pdfInlineResponse, resolveStoredPdf } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewProjectDispatches(session.user.roles)) {
    return projectDispatchErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectDispatchErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const dispatch = await getProjectDispatchRecord(prisma, companyId, id);
  if (!dispatch) {
    return projectDispatchErrorResponse("NOT_FOUND", "Project dispatch not found.", 404);
  }
  if (dispatch.status === "DRAFT") {
    return projectDispatchErrorResponse(
      "INVALID_STATUS",
      "Confirm dispatch before generating DC PDF.",
      400,
    );
  }

  const pdf = await resolveStoredPdf(prisma, {
    documentType: "PROJECT_DISPATCH",
    documentId: dispatch.id,
    contentVersion: pdfContentVersion([dispatch.updatedAt.toISOString(), dispatch.status]),
    generate: () => generateProjectDispatchPdf(dispatch),
  });

  return pdfInlineResponse(pdf, dispatch.dispatchNo);
}
