import { ProjectProposalStatus } from "@prisma/client";
import type { ProjectProposalFormValues } from "@/components/project-proposals/project-proposal-form";

type BrandRef = { code: string; name: string };

type RevisionLike = {
  customerName: string;
  customerMobile: string;
  shortAddress: string;
  proposalDate: string;
  validityDate: string;
  package: { id: string };
  connectionPhase: "SINGLE_PHASE" | "THREE_PHASE";
  inverterBrands: string[];
  inverterUpgrade?: { id: string } | null;
  structureType: "CUSTOM_FABRICATED" | "PREFAB_C_CHANNEL" | "MONO_RAIL";
  buildingType: "APARTMENT" | "BUNGALOW";
  extraFloors: number;
  futureStructurePanels: number;
  dcrAdditionalPanels: number;
  ndcrAdditionalPanels: number;
  ndcrPanelWp?: number;
  moduleProductId?: string | null;
  moduleQty?: number | null;
  inverterCapacityKw?: number | null;
  discountAmount: number;
  additionalCostAmount: number;
  notes?: string | null;
};

const REVISABLE_STATUSES = new Set<ProjectProposalStatus>([
  ProjectProposalStatus.SENT,
  ProjectProposalStatus.APPROVED,
  ProjectProposalStatus.REJECTED,
  ProjectProposalStatus.EXPIRED,
]);

export function getNextProjectProposalRevisionNo(currentRevisionNo: number): number {
  return currentRevisionNo + 1;
}

export function canReviseProjectProposal(status: ProjectProposalStatus | string): boolean {
  return REVISABLE_STATUSES.has(status as ProjectProposalStatus);
}

export function mapRevisionBrandNamesToCodes(
  brandNames: string[],
  brands: BrandRef[],
): string[] {
  return brandNames
    .map((name) => brands.find((brand) => brand.name === name)?.code)
    .filter((code): code is string => Boolean(code));
}

export function mapRevisionToFormValues(
  revision: RevisionLike,
  brands: BrandRef[],
): ProjectProposalFormValues {
  return {
    customerName: revision.customerName,
    customerMobile: revision.customerMobile,
    shortAddress: revision.shortAddress,
    proposalDate: revision.proposalDate,
    validityDate: revision.validityDate,
    packageId: revision.package.id,
    connectionPhase: revision.connectionPhase,
    inverterBrandCodes: mapRevisionBrandNamesToCodes(revision.inverterBrands, brands),
    inverterUpgradeId: revision.inverterUpgrade?.id ?? "",
    structureType: revision.structureType,
    buildingType: revision.buildingType,
    extraFloors: String(revision.extraFloors),
    futureStructurePanels: String(revision.futureStructurePanels),
    dcrAdditionalPanels: String(revision.dcrAdditionalPanels),
    ndcrAdditionalPanels: String(revision.ndcrAdditionalPanels),
    ndcrPanelWp: String(revision.ndcrPanelWp ?? 580),
    moduleProductId: revision.moduleProductId ?? "",
    moduleQty: String(revision.moduleQty ?? ""),
    inverterCapacityKw: revision.inverterCapacityKw
      ? String(revision.inverterCapacityKw)
      : "",
    discountAmount: String(revision.discountAmount),
    additionalCostAmount: String(revision.additionalCostAmount),
    notes: revision.notes ?? "",
  };
}
