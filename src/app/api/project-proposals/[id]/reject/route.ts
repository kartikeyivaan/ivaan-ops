import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canApproveProjectProposals } from "@/lib/project-proposal-permissions";
import { rejectProjectProposal } from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { rejectProjectProposalSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApproveProjectProposals(session.user.roles)) {
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

  const body = await request.json();
  const parsed = rejectProjectProposalSchema.safeParse(body);
  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid rejection data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;

  try {
    const proposal = await rejectProjectProposal(prisma, {
      companyId,
      proposalId: id,
      performedById: session.user.id,
      reason: parsed.data.reason,
    });
    return NextResponse.json(proposal);
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
