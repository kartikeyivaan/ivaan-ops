import { NextResponse } from "next/server";
import { generateProjectProposalPdf, projectProposalPdfInclude } from "@/lib/project-proposal-pdf";
import { assertProjectProposalShareable } from "@/lib/project-proposal-service";
import { verifyProjectProposalShareToken } from "@/lib/share-token";
import { pdfContentVersion, pdfInlineResponse, resolveStoredPdf } from "@/lib/pdf-cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json({ code: "TOKEN_REQUIRED", message: "Share token is required." }, { status: 400 });
  }

  const verified = verifyProjectProposalShareToken(token);
  if (!verified) {
    return NextResponse.json(
      { code: "INVALID_TOKEN", message: "Share link is invalid or expired." },
      { status: 403 },
    );
  }

  const proposal = await prisma.projectProposal.findUnique({
    where: { id: verified.proposalId },
    include: projectProposalPdfInclude,
  });

  if (!proposal) {
    return NextResponse.json({ code: "NOT_FOUND", message: "Project proposal not found." }, { status: 404 });
  }

  try {
    assertProjectProposalShareable(proposal);
  } catch {
    return NextResponse.json(
      { code: "PROPOSAL_NOT_SHAREABLE", message: "This proposal is not available for sharing." },
      { status: 403 },
    );
  }

  const pdf = await resolveStoredPdf(prisma, {
    documentType: "PROJECT_PROPOSAL",
    documentId: proposal.id,
    variant: "full",
    contentVersion: pdfContentVersion([
      proposal.updatedAt.toISOString(),
      proposal.status,
      proposal.currentRevisionNo,
      "full",
    ]),
    generate: () => generateProjectProposalPdf(proposal),
  });
  const revision =
    proposal.revisions.find((entry) => entry.revisionNo === proposal.currentRevisionNo) ??
    proposal.revisions[proposal.revisions.length - 1];
  const customerName = revision?.customerName ?? "Customer";
  const rawName = `${proposal.proposalNo} - ${customerName}`;
  const safeName = rawName.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();

  return pdfInlineResponse(pdf, safeName, {
    asciiName: safeName.replace(/[^\x20-\x7E]/g, "_"),
    privateCache: false,
  });
}
