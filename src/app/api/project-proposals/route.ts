import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import {
  canManageProjectProposals,
  canViewProjectProposals,
  restrictProjectProposalSalesUserId,
} from "@/lib/project-proposal-permissions";
import { buildProjectProposalSharePayload } from "@/lib/project-proposal-share";
import {
  createProjectProposal,
  listProjectProposals,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import {
  createProjectProposalSchema,
  projectProposalSearchSchema,
} from "@/lib/validations";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const parsed = projectProposalSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    salesUserId: searchParams.get("salesUserId") ?? undefined,
    packageId: searchParams.get("packageId") ?? undefined,
    customerMobile: searchParams.get("customerMobile") ?? undefined,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
  });

  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid filters.",
      400,
      parsed.error.flatten(),
    );
  }

  const salesUserId = restrictProjectProposalSalesUserId(
    session.user.roles,
    session.user.id,
    parsed.data.salesUserId,
  );

  const proposals = await listProjectProposals(prisma, companyId, {
    ...parsed.data,
    salesUserId,
  });

  return NextResponse.json(proposals);
}

export async function POST(request: Request) {
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
  const parsed = createProjectProposalSchema.safeParse(body);
  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid project proposal data.",
      400,
      parsed.error.flatten(),
    );
  }

  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (!assertCompanyAccess(session.user.roles, userCompanyIds, companyId)) {
    return projectProposalErrorResponse(
      "FORBIDDEN",
      "You do not have access to this company.",
      403,
    );
  }

  const salesUserId =
    restrictProjectProposalSalesUserId(
      session.user.roles,
      session.user.id,
      parsed.data.salesUserId,
    ) ?? session.user.id;

  const proposalDate = parsed.data.proposalDate
    ? new Date(parsed.data.proposalDate)
    : undefined;

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
        futureStructurePanels: parsed.data.futureStructurePanels,
        discountAmount: parsed.data.discountAmount,
      },
    });

    const share = buildProjectProposalSharePayload(result.proposal);

    return NextResponse.json({ ...result, share }, { status: 201 });
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
