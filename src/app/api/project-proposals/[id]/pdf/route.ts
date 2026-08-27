import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import {
  generateProjectProposalPdfByFormat,
  projectProposalPdfInclude,
  type ProjectProposalPdfFormat,
} from "@/lib/project-proposal-pdf";
import { assertProjectProposalAccess } from "@/lib/project-proposal-service";
import { canViewProjectProposals } from "@/lib/project-proposal-permissions";
import { pdfContentVersion, pdfInlineResponse, resolveStoredPdf } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function resolvePdfFormat(request: Request): ProjectProposalPdfFormat {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  return format === "card" ? "card" : "full";
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canViewProjectProposals(session.user.roles)) {
    return projectProposalErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return projectProposalErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const format = resolvePdfFormat(request);

  try {
    const proposal = await prisma.projectProposal.findFirst({
      where: { id, companyId },
      include: projectProposalPdfInclude,
    });

    if (!proposal) {
      return projectProposalErrorResponse("NOT_FOUND", "Project proposal not found.", 404);
    }

    assertProjectProposalAccess(session.user.roles, session.user.id, proposal);

    const pdf = await resolveStoredPdf(prisma, {
      documentType: "PROJECT_PROPOSAL",
      documentId: proposal.id,
      variant: format,
      contentVersion: pdfContentVersion([
        proposal.updatedAt.toISOString(),
        proposal.status,
        proposal.currentRevisionNo,
        format,
      ]),
      generate: () => generateProjectProposalPdfByFormat(proposal, format),
    });
    const revision =
      proposal.revisions.find((entry) => entry.revisionNo === proposal.currentRevisionNo) ??
      proposal.revisions[proposal.revisions.length - 1];
    const customerName = revision?.customerName ?? "Customer";
    const suffix = format === "card" ? " Quote Card" : " Proposal";
    const rawName = `${proposal.proposalNo}${suffix} - ${customerName}`;
    const safeName = rawName.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();

    return pdfInlineResponse(pdf, safeName, {
      asciiName: safeName.replace(/[^\x20-\x7E]/g, "_"),
    });
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
