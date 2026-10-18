import { ProposalPackageType } from "@prisma/client";

export const NDCR_COMPLETE_PACKAGE_CODE = "NDCR_COMPLETE";

export function isNdcrCompletePackage(code: string | null | undefined): boolean {
  return code === NDCR_COMPLETE_PACKAGE_CODE;
}

export type ProposalPackageKindInput = {
  code: string;
  packageType: ProposalPackageType;
};

export function isCustomPricingProposalPackage(
  pkg: ProposalPackageKindInput,
): boolean {
  return (
    pkg.packageType === ProposalPackageType.NON_SUBSIDY_CUSTOM ||
    isNdcrCompletePackage(pkg.code)
  );
}

export function isHybridProposalPackage(pkg: ProposalPackageKindInput): boolean {
  return pkg.packageType === ProposalPackageType.HYBRID;
}

export function isSubsidyEligibleProposalPackage(
  pkg: ProposalPackageKindInput,
): boolean {
  return pkg.packageType === ProposalPackageType.SUBSIDY_DCR;
}

export const PROPOSAL_PACKAGE_TYPE_LABELS: Record<ProposalPackageType, string> = {
  [ProposalPackageType.SUBSIDY_DCR]: "Subsidy (DCR)",
  [ProposalPackageType.NON_SUBSIDY_FIXED]: "Non-subsidy (fixed bundle)",
  [ProposalPackageType.NON_SUBSIDY_CUSTOM]: "Non-subsidy (custom total)",
  [ProposalPackageType.HYBRID]: "Hybrid",
};
