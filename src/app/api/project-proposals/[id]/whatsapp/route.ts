import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decimalToNumber } from "@/lib/inventory";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canViewProjectProposals } from "@/lib/project-proposal-permissions";
import { buildProjectProposalSharePayload } from "@/lib/project-proposal-share";
import {
  assertProjectProposalAccess,
  assertProjectProposalShareable,
  projectProposalInclude,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
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

  try {
    const proposal = await prisma.projectProposal.findFirst({
      where: { id, companyId },
      include: projectProposalInclude,
    });

    if (!proposal) {
      return projectProposalErrorResponse("NOT_FOUND", "Project proposal not found.", 404);
    }

    assertProjectProposalAccess(session.user.roles, session.user.id, proposal);
    assertProjectProposalShareable(proposal);

    const share = buildProjectProposalSharePayload({
      id: proposal.id,
      proposalNo: proposal.proposalNo,
      currentRevisionNo: proposal.currentRevisionNo,
      revisions: proposal.revisions.map((revision) => ({
        revisionNo: revision.revisionNo,
        customerName: revision.customerName,
        customerMobile: revision.customerMobile,
        finalAmount: decimalToNumber(revision.finalAmount),
        subsidyEstimate: decimalToNumber(revision.subsidyEstimate),
        effectiveCustomerInvestment: decimalToNumber(revision.effectiveCustomerInvestment),
      })),
    });

    return NextResponse.json(share);
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
