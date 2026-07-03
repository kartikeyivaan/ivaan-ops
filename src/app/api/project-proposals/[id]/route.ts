import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import {
  canManageProjectProposals,
  canViewProjectProposals,
} from "@/lib/project-proposal-permissions";
import {
  assertProjectProposalAccess,
  getProjectProposalById,
  updateProjectProposalDraft,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { updateProjectProposalSchema } from "@/lib/validations";

function normalizeShortAddress(value?: string) {
  return value?.trim() || "—";
}

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
    const proposal = await getProjectProposalById(prisma, companyId, id);
    if (!proposal) {
      return projectProposalErrorResponse("NOT_FOUND", "Project proposal not found.", 404);
    }

    assertProjectProposalAccess(session.user.roles, session.user.id, proposal);
    return NextResponse.json(proposal);
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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
  const parsed = updateProjectProposalSchema.safeParse(body);
  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid project proposal data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;
  const proposalDate = parsed.data.proposalDate
    ? new Date(parsed.data.proposalDate)
    : undefined;

  try {
    const result = await updateProjectProposalDraft(prisma, {
      proposalId: id,
      companyId,
      updatedById: session.user.id,
      userRoles: session.user.roles,
      form: {
        customerName: parsed.data.customerName,
        customerMobile: parsed.data.customerMobile,
        shortAddress: normalizeShortAddress(parsed.data.shortAddress),
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

    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
