import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
import { reviseProjectProposal } from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { reviseProjectProposalSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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

  const body = await request.json();
  const parsed = reviseProjectProposalSchema.safeParse(body);
  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid revision data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;
  const proposalDate = parsed.data.proposalDate
    ? new Date(parsed.data.proposalDate)
    : undefined;

  try {
    const result = await reviseProjectProposal(prisma, {
      companyId,
      proposalId: id,
      createdById: session.user.id,
      userRoles: session.user.roles,
      form: {
        customerName: parsed.data.customerName,
        customerMobile: parsed.data.customerMobile,
        shortAddress: parsed.data.shortAddress?.trim() || "—",
        proposalDate,
        notes: parsed.data.notes,
        inverterBrandCodes: parsed.data.inverterBrandCodes,
        pricing: {
          packageId: parsed.data.packageId,
          connectionPhase: parsed.data.connectionPhase,
          inverterBrandCodes: parsed.data.inverterBrandCodes,
          inverterUpgradeId: parsed.data.inverterUpgradeId,
          structureType: parsed.data.structureType,
          buildingType: parsed.data.buildingType,
          extraFloors: parsed.data.extraFloors,
          ndcrAdditionalPanels: parsed.data.ndcrAdditionalPanels,
          futureStructurePanels: parsed.data.futureStructurePanels,
          discountAmount: parsed.data.discountAmount,
        },
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
