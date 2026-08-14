import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { mapProjectEnquiryError } from "@/lib/project-enquiry-api";
import { attachProposalToEnquiry } from "@/lib/project-enquiry-service";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canManageProjectProposals, restrictProjectProposalSalesUserId } from "@/lib/project-proposal-permissions";
import { buildProjectProposalSharePayload } from "@/lib/project-proposal-share";
import { createProjectProposal } from "@/lib/project-proposal-service";
import { mapProjectsCompanySessionError, requireProjectsCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/prisma";
import { createProjectProposalSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canManageProjectProposals(session.user.roles)) {
    return projectProposalErrorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
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

  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (!assertCompanyAccess(session.user.roles, userCompanyIds, companyId)) {
    return projectProposalErrorResponse("FORBIDDEN", "You do not have access to this company.", 403);
  }

  const parsed = createProjectProposalSchema.safeParse(await request.json());
  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid project proposal data.",
      400,
      parsed.error.flatten(),
    );
  }

  const { id } = await context.params;
  const salesUserId =
    restrictProjectProposalSalesUserId(
      session.user.roles,
      session.user.id,
      parsed.data.salesUserId,
    ) ?? session.user.id;
  const proposalDate = parsed.data.proposalDate ? new Date(parsed.data.proposalDate) : undefined;

  try {
    const result = await createProjectProposal(prisma, {
      companyId,
      salesUserId,
      createdById: session.user.id,
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
        ndcrPanelWp: parsed.data.ndcrPanelWp,
        dcrAdditionalPanels: parsed.data.dcrAdditionalPanels,
        futureStructurePanels: parsed.data.futureStructurePanels,
        discountAmount: parsed.data.discountAmount,
        additionalCostAmount: parsed.data.additionalCostAmount,
        moduleProductId: parsed.data.moduleProductId,
        moduleQty: parsed.data.moduleQty,
        inverterCapacityKw: parsed.data.inverterCapacityKw,
      },
    });

    await attachProposalToEnquiry(prisma, {
      enquiryId: id,
      companyId,
      proposalId: result.proposal.id,
      userId: session.user.id,
    });

    return NextResponse.json({ ...result, share: buildProjectProposalSharePayload(result.proposal) }, { status: 201 });
  } catch (error) {
    const enquiryMapped = mapProjectEnquiryError(error);
    if (enquiryMapped) return enquiryMapped;
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
