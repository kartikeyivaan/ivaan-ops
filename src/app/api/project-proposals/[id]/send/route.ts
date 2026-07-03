import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
import { sendProjectProposal } from "@/lib/project-proposal-service";
import { buildProjectProposalSharePayload } from "@/lib/project-proposal-share";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProjectProposals(session.user.roles)) {
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
    const proposal = await sendProjectProposal(prisma, {
      companyId,
      proposalId: id,
      performedById: session.user.id,
      userRoles: session.user.roles,
    });
    const share = buildProjectProposalSharePayload(proposal);
    return NextResponse.json({ proposal, share });
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
