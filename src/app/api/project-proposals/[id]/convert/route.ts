import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canConvertProjectProposal } from "@/lib/project-permissions";
import { convertProjectProposalToProject } from "@/lib/project-proposal-service";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canConvertProjectProposal(session.user.roles)) {
    return projectProposalErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  let companyId: string;
  try {
    companyId = requireProjectsCompany(session);
  } catch (error) {
    const mapped = mapProjectsCompanySessionError(error);
    if (mapped) {
      return projectProposalErrorResponse(mapped.code, mapped.message, mapped.status);
    }
    throw error;
  }

  const { id } = await context.params;

  try {
    const proposal = await convertProjectProposalToProject(prisma, {
      companyId,
      proposalId: id,
      performedById: session.user.id,
      userRoles: session.user.roles,
    });
    return NextResponse.json(proposal);
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
