import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mapProjectProposalError, projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
import {
  resolveProjectProposalPricing,
  serializePricingBreakdown,
} from "@/lib/project-proposal-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { projectProposalPricingSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageProjectProposals(session.user.roles)) {
    return projectProposalErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  try {
    requireActiveCompany(session);
  } catch {
    return projectProposalErrorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = projectProposalPricingSchema.safeParse(body);
  if (!parsed.success) {
    return projectProposalErrorResponse(
      "VALIDATION_ERROR",
      "Invalid pricing inputs.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const breakdown = await resolveProjectProposalPricing(prisma, {
      packageId: parsed.data.packageId,
      connectionPhase: parsed.data.connectionPhase,
      inverterBrandCodes: parsed.data.inverterBrandCodes,
      inverterUpgradeId: parsed.data.inverterUpgradeId,
      structureType: parsed.data.structureType,
      buildingType: parsed.data.buildingType,
      extraFloors: parsed.data.extraFloors,
      ndcrAdditionalPanels: parsed.data.ndcrAdditionalPanels,
      futureStructurePanels: parsed.data.futureStructurePanels,
      dcrAdditionalPanels: parsed.data.dcrAdditionalPanels,
      discountAmount: parsed.data.discountAmount,
      additionalCostAmount: parsed.data.additionalCostAmount,
      moduleProductId: parsed.data.moduleProductId,
      moduleQty: parsed.data.moduleQty,
      inverterCapacityKw: parsed.data.inverterCapacityKw,
    });

    return NextResponse.json({
      pricing: serializePricingBreakdown(breakdown),
    });
  } catch (error) {
    const mapped = mapProjectProposalError(error);
    if (mapped) return mapped;
    throw error;
  }
}
