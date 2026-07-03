import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canApproveProjectProposals } from "@/lib/project-proposal-permissions";
import { approveProjectProposal } from "@/lib/project-proposal-service";
import { buildProjectProposalSharePayload } from "@/lib/project-proposal-share";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { approveProjectProposalSchema } from "@/lib/validations";

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

  const body = await request.json().catch(() => ({}));
  const parsed = approveProjectProposalSchema.safeParse(body);
  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid approval data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;

  try {
    const proposal = await approveProjectProposal(prisma, {
      companyId,
      proposalId: id,
      performedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    const share = buildProjectProposalSharePayload(proposal);
    return NextResponse.json({ proposal, share });
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
