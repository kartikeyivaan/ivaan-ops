import {
  ProjectProposalApprovalStatus,
  ProjectProposalStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { decimalToNumber } from "@/lib/inventory";
import {
  DISCOUNT_APPROVAL_THRESHOLD,
  calculateProjectProposalPricing,
  toRevisionPricingSnapshot,
  type ProjectProposalPricingBreakdown,
  type ProjectProposalPricingInput,
} from "@/lib/project-proposal-pricing";
import {
  canShareProjectProposal,
  generateProposalNumber,
  getProposalValidityDate,
} from "@/lib/project-proposals";
import { getNextProjectProposalRevisionNo } from "@/lib/project-proposal-revision";
import { canAccessProjectProposal, canEditProjectProposal } from "@/lib/project-proposal-permissions";
import { toDateOnly } from "@/lib/quotations";

export type ResolveProjectProposalPricingInput = {
  packageId: string;
  connectionPhase: ProjectProposalPricingInput["connectionPhase"];
  inverterBrandCodes: string[];
  inverterUpgradeId?: string | null;
  structureType: ProjectProposalPricingInput["structureType"];
  buildingType: ProjectProposalPricingInput["buildingType"];
  extraFloors?: number;
  ndcrAdditionalPanels?: number;
  ndcrPanelWp?: number;
  futureStructurePanels?: number;
  discountAmount?: number;
};

export const projectProposalRevisionInclude = {
  package: true,
  inverterUpgrade: true,
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ProjectProposalRevisionInclude;

export const projectProposalInclude = {
  company: { select: { id: true, name: true, code: true } },
  salesUser: { select: { id: true, name: true, email: true, mobile: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  revisions: {
    include: projectProposalRevisionInclude,
    orderBy: { revisionNo: "asc" as const },
  },
} satisfies Prisma.ProjectProposalInclude;

export type ProjectProposalRecord = Prisma.ProjectProposalGetPayload<{
  include: typeof projectProposalInclude;
}>;

export type ProjectProposalFormInput = {
  customerName: string;
  customerMobile: string;
  shortAddress: string;
  proposalDate?: Date;
  notes?: string;
  pricing: ResolveProjectProposalPricingInput;
  inverterBrandCodes: string[];
};

function serializeRevision(
  revision: Prisma.ProjectProposalRevisionGetPayload<{
    include: typeof projectProposalRevisionInclude;
  }>,
) {
  return {
    ...revision,
    proposalDate: revision.proposalDate.toISOString().slice(0, 10),
    validityDate: revision.validityDate.toISOString().slice(0, 10),
    basePackageAmount: decimalToNumber(revision.basePackageAmount),
    brandUpgradeAmount: decimalToNumber(revision.brandUpgradeAmount),
    inverterUpgradeAmount: decimalToNumber(revision.inverterUpgradeAmount),
    threePhaseAmount: decimalToNumber(revision.threePhaseAmount),
    structureAdjustmentAmount: decimalToNumber(revision.structureAdjustmentAmount),
    extraFloorAmount: decimalToNumber(revision.extraFloorAmount),
    futureStructureAmount: decimalToNumber(revision.futureStructureAmount),
    ndcrPanelAmount: decimalToNumber(revision.ndcrPanelAmount),
    discountAmount: decimalToNumber(revision.discountAmount),
    subsidyEstimate: decimalToNumber(revision.subsidyEstimate),
    finalAmount: decimalToNumber(revision.finalAmount),
    effectiveCustomerInvestment: decimalToNumber(revision.effectiveCustomerInvestment),
    package: {
      ...revision.package,
      systemKw: decimalToNumber(revision.package.systemKw),
      basePrice: decimalToNumber(revision.package.basePrice),
    },
    inverterUpgrade: revision.inverterUpgrade
      ? {
          ...revision.inverterUpgrade,
          upgradeKw: decimalToNumber(revision.inverterUpgrade.upgradeKw),
          upgradeAmount: decimalToNumber(revision.inverterUpgrade.upgradeAmount),
        }
      : null,
    inverterBrands: revision.inverterBrands as string[],
  };
}

export function serializeProjectProposal(proposal: ProjectProposalRecord) {
  const currentRevision =
    proposal.revisions.find((revision) => revision.revisionNo === proposal.currentRevisionNo) ??
    proposal.revisions[proposal.revisions.length - 1] ??
    null;

  return {
    ...proposal,
    convertedAt: proposal.convertedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    revisions: proposal.revisions.map(serializeRevision),
    currentRevision: currentRevision ? serializeRevision(currentRevision) : null,
  };
}

async function recordStatusChange(
  tx: Prisma.TransactionClient,
  input: {
    proposalId: string;
    revisionId?: string;
    fromStatus: ProjectProposalStatus | null;
    toStatus: ProjectProposalStatus;
    changedById: string;
    remarks?: string;
  },
) {
  await tx.projectProposalStatusHistory.create({
    data: {
      proposalId: input.proposalId,
      revisionId: input.revisionId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      changedById: input.changedById,
      remarks: input.remarks,
    },
  });
}

async function loadProposalOrThrow(
  prisma: PrismaClient,
  companyId: string,
  proposalId: string,
) {
  const proposal = await prisma.projectProposal.findFirst({
    where: { id: proposalId, companyId },
    include: projectProposalInclude,
  });
  if (!proposal) {
    throw new Error("PROPOSAL_NOT_FOUND");
  }
  return proposal;
}

export function assertProjectProposalAccess(
  userRoles: string[],
  userId: string,
  proposal: { salesUserId: string },
) {
  if (!canAccessProjectProposal(userRoles, userId, proposal.salesUserId)) {
    throw new Error("FORBIDDEN");
  }
}

export function assertProjectProposalEditable(
  userRoles: string[],
  userId: string,
  proposal: { salesUserId: string; status: ProjectProposalStatus },
) {
  assertProjectProposalAccess(userRoles, userId, proposal);
  if (!canEditProjectProposal(userRoles, userId, proposal)) {
    throw new Error("PROPOSAL_NOT_EDITABLE");
  }
}

export function assertProjectProposalShareable(proposal: { status: ProjectProposalStatus }) {
  if (!canShareProjectProposal(proposal.status)) {
    throw new Error("PROPOSAL_NOT_SHAREABLE");
  }
}

async function buildRevisionWriteData(
  prisma: PrismaClient,
  input: ProjectProposalFormInput,
  actorId: string,
) {
  const breakdown = await resolveProjectProposalPricing(prisma, input.pricing);
  const snapshot = toRevisionPricingSnapshot(breakdown);
  const proposalDate = toDateOnly(input.proposalDate ?? new Date());
  const validityDate = getProposalValidityDate(proposalDate);

  const brandRecords = await prisma.proposalInverterBrandMaster.findMany({
    where: { code: { in: input.inverterBrandCodes } },
    orderBy: { sortOrder: "asc" },
  });

  return {
    breakdown,
    snapshot,
    proposalDate,
    validityDate,
    brandRecords,
    revisionData: {
      customerName: input.customerName,
      customerMobile: input.customerMobile,
      shortAddress: input.shortAddress,
      proposalDate,
      validityDate,
      packageId: input.pricing.packageId,
      connectionPhase: input.pricing.connectionPhase,
      inverterBrands: brandRecords.map((brand) => brand.name),
      inverterUpgradeId: input.pricing.inverterUpgradeId ?? null,
      structureType: input.pricing.structureType,
      buildingType: input.pricing.buildingType,
      extraFloors: input.pricing.extraFloors ?? 0,
      ndcrAdditionalPanels: input.pricing.ndcrAdditionalPanels ?? 0,
      ndcrPanelWp: input.pricing.ndcrPanelWp ?? 580,
      futureStructurePanels: input.pricing.futureStructurePanels ?? 0,
      ...snapshot,
      notes: input.notes,
      updatedById: actorId,
    },
  };
}

export async function refreshExpiredProjectProposals(
  prisma: PrismaClient,
  companyId: string,
) {
  const today = toDateOnly(new Date());
  const candidates = await prisma.projectProposal.findMany({
    where: {
      companyId,
      status: { in: [ProjectProposalStatus.SENT, ProjectProposalStatus.APPROVED] },
    },
    include: {
      revisions: {
        select: { revisionNo: true, validityDate: true },
      },
    },
  });

  const expiredIds = candidates
    .filter((proposal) => {
      const current = proposal.revisions.find(
        (revision) => revision.revisionNo === proposal.currentRevisionNo,
      );
      return current ? current.validityDate < today : false;
    })
    .map((proposal) => proposal.id);

  if (expiredIds.length === 0) return;

  await prisma.projectProposal.updateMany({
    where: { id: { in: expiredIds } },
    data: { status: ProjectProposalStatus.EXPIRED },
  });
}

export async function listProjectProposals(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    status?: ProjectProposalStatus;
    salesUserId?: string;
    packageId?: string;
    customerMobile?: string;
    fromDate?: string;
    toDate?: string;
  },
) {
  await refreshExpiredProjectProposals(prisma, companyId);

  const revisionFilter: Prisma.ProjectProposalRevisionWhereInput = {
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
    ...(filters.customerMobile
      ? { customerMobile: { contains: filters.customerMobile } }
      : {}),
    ...(filters.fromDate || filters.toDate
      ? {
          proposalDate: {
            ...(filters.fromDate ? { gte: toDateOnly(new Date(filters.fromDate)) } : {}),
            ...(filters.toDate ? { lte: toDateOnly(new Date(filters.toDate)) } : {}),
          },
        }
      : {}),
  };

  const where: Prisma.ProjectProposalWhereInput = {
    companyId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.salesUserId ? { salesUserId: filters.salesUserId } : {}),
    ...(Object.keys(revisionFilter).length > 0
      ? { revisions: { some: revisionFilter } }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { proposalNo: { contains: filters.q, mode: "insensitive" } },
            {
              revisions: {
                some: {
                  OR: [
                    { customerName: { contains: filters.q, mode: "insensitive" } },
                    { customerMobile: { contains: filters.q, mode: "insensitive" } },
                    { shortAddress: { contains: filters.q, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const proposals = await prisma.projectProposal.findMany({
    where,
    include: projectProposalInclude,
    orderBy: { createdAt: "desc" },
  });

  return proposals.map(serializeProjectProposal);
}

export async function getProjectProposalById(
  prisma: PrismaClient,
  companyId: string,
  proposalId: string,
) {
  await refreshExpiredProjectProposals(prisma, companyId);

  const proposal = await prisma.projectProposal.findFirst({
    where: { id: proposalId, companyId },
    include: {
      ...projectProposalInclude,
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: {
          changedBy: { select: { id: true, name: true, email: true } },
          revision: { select: { revisionNo: true } },
        },
      },
      approvals: {
        orderBy: { createdAt: "desc" },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          decidedBy: { select: { id: true, name: true, email: true } },
          revision: { select: { revisionNo: true } },
        },
      },
    },
  });

  if (!proposal) return null;

  return {
    ...serializeProjectProposal(proposal),
    statusHistory: proposal.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      remarks: entry.remarks,
      revisionId: entry.revisionId,
      revisionNo: entry.revision?.revisionNo ?? null,
      createdAt: entry.createdAt.toISOString(),
      changedBy: entry.changedBy,
    })),
    approvals: proposal.approvals.map((entry) => ({
      id: entry.id,
      status: entry.status,
      discountAmount: decimalToNumber(entry.discountAmount),
      remarks: entry.remarks,
      revisionId: entry.revisionId,
      revisionNo: entry.revision.revisionNo,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      requestedBy: entry.requestedBy,
      decidedBy: entry.decidedBy,
    })),
  };
}

function mapBrand(record: {
  code: string;
  name: string;
  brandUpgradeAmount: Prisma.Decimal;
  isActive: boolean;
  isComingSoon: boolean;
}) {
  return {
    code: record.code,
    name: record.name,
    brandUpgradeAmount: decimalToNumber(record.brandUpgradeAmount),
    isActive: record.isActive,
    isComingSoon: record.isComingSoon,
  };
}

function mapPackage(record: {
  code: string;
  panelWp: number;
  panelCount: number;
  systemKw: Prisma.Decimal;
  basePrice: Prisma.Decimal;
  isActive: boolean;
  isComingSoon: boolean;
}) {
  return {
    code: record.code,
    panelWp: record.panelWp,
    panelCount: record.panelCount,
    systemKw: decimalToNumber(record.systemKw),
    basePrice: decimalToNumber(record.basePrice),
    isActive: record.isActive,
    isComingSoon: record.isComingSoon,
  };
}

export async function resolveProjectProposalPricing(
  prisma: PrismaClient,
  input: ResolveProjectProposalPricingInput,
): Promise<ProjectProposalPricingBreakdown> {
  const pkg = await prisma.proposalPackageMaster.findUnique({
    where: { id: input.packageId },
  });
  if (!pkg) {
    throw new Error("PACKAGE_NOT_FOUND");
  }
  if (!pkg.isActive || pkg.isComingSoon) {
    throw new Error("PACKAGE_UNAVAILABLE");
  }

  const uniqueBrandCodes = [...new Set(input.inverterBrandCodes)];
  if (uniqueBrandCodes.length === 0) {
    throw new Error("INVERTER_BRANDS_REQUIRED");
  }

  const brandRecords = await prisma.proposalInverterBrandMaster.findMany({
    where: { code: { in: uniqueBrandCodes } },
  });

  if (brandRecords.length !== uniqueBrandCodes.length) {
    throw new Error("INVERTER_BRAND_NOT_FOUND");
  }

  const inactiveBrand = brandRecords.find(
    (brand) => !brand.isActive || brand.isComingSoon,
  );
  if (inactiveBrand) {
    throw new Error("INVERTER_BRAND_UNAVAILABLE");
  }

  let inverterUpgrade: ProjectProposalPricingInput["inverterUpgrade"] = null;
  if (input.inverterUpgradeId) {
    const upgrade = await prisma.proposalInverterUpgradeMaster.findUnique({
      where: { id: input.inverterUpgradeId },
    });
    if (!upgrade) {
      throw new Error("INVERTER_UPGRADE_NOT_FOUND");
    }
    if (!upgrade.isActive) {
      throw new Error("INVERTER_UPGRADE_UNAVAILABLE");
    }
    if (upgrade.packagePanelCount !== pkg.panelCount) {
      throw new Error("INVERTER_UPGRADE_NOT_APPLICABLE");
    }
    inverterUpgrade = {
      packagePanelCount: upgrade.packagePanelCount,
      upgradeKw: decimalToNumber(upgrade.upgradeKw),
      upgradeAmount: decimalToNumber(upgrade.upgradeAmount),
      isActive: upgrade.isActive,
    };
  }

  const ndcrAdditionalPanels = input.ndcrAdditionalPanels ?? 0;
  if (pkg.panelWp < 570 && ndcrAdditionalPanels > 0) {
    throw new Error("NDCR_NOT_APPLICABLE");
  }

  return calculateProjectProposalPricing({
    package: mapPackage(pkg),
    connectionPhase: input.connectionPhase,
    inverterBrands: brandRecords.map(mapBrand),
    inverterUpgrade,
    structureType: input.structureType,
    buildingType: input.buildingType,
    extraFloors: input.extraFloors ?? 0,
    ndcrAdditionalPanels,
    futureStructurePanels: input.futureStructurePanels ?? 0,
    discountAmount: input.discountAmount ?? 0,
  });
}

export function serializePricingBreakdown(breakdown: ProjectProposalPricingBreakdown) {
  return {
    ...breakdown,
    pdfGst: breakdown.pdfGst,
  };
}

export async function createProjectProposal(
  prisma: PrismaClient,
  input: {
    companyId: string;
    salesUserId: string;
    createdById: string;
    customerName: string;
    customerMobile: string;
    shortAddress: string;
    proposalDate?: Date;
    notes?: string;
    pricing: ResolveProjectProposalPricingInput;
    inverterBrandCodes: string[];
  },
) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, code: true },
  });
  if (!company) {
    throw new Error("COMPANY_NOT_FOUND");
  }

  const breakdown = await resolveProjectProposalPricing(prisma, input.pricing);
  const snapshot = toRevisionPricingSnapshot(breakdown);
  const proposalDate = toDateOnly(input.proposalDate ?? new Date());
  const validityDate = getProposalValidityDate(proposalDate);
  const proposalNo = await generateProposalNumber(prisma, company.code, input.companyId);

  const pkg = await prisma.proposalPackageMaster.findUniqueOrThrow({
    where: { id: input.pricing.packageId },
  });

  const brandRecords = await prisma.proposalInverterBrandMaster.findMany({
    where: { code: { in: input.inverterBrandCodes } },
    orderBy: { sortOrder: "asc" },
  });

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.projectProposal.create({
      data: {
        proposalNo,
        companyId: input.companyId,
        salesUserId: input.salesUserId,
        status: ProjectProposalStatus.DRAFT,
        currentRevisionNo: 0,
        createdById: input.createdById,
        updatedById: input.createdById,
        revisions: {
          create: {
            revisionNo: 0,
            customerName: input.customerName,
            customerMobile: input.customerMobile,
            shortAddress: input.shortAddress,
            proposalDate,
            validityDate,
            packageId: input.pricing.packageId,
            connectionPhase: input.pricing.connectionPhase,
            inverterBrands: brandRecords.map((brand) => brand.name),
            inverterUpgradeId: input.pricing.inverterUpgradeId ?? null,
            structureType: input.pricing.structureType,
            buildingType: input.pricing.buildingType,
            extraFloors: input.pricing.extraFloors ?? 0,
            ndcrAdditionalPanels: input.pricing.ndcrAdditionalPanels ?? 0,
            ndcrPanelWp: input.pricing.ndcrPanelWp ?? 580,
            futureStructurePanels: input.pricing.futureStructurePanels ?? 0,
            ...snapshot,
            notes: input.notes,
            createdById: input.createdById,
            updatedById: input.createdById,
          },
        },
      },
      include: projectProposalInclude,
    });

    const initialRevision = proposal.revisions.find((revision) => revision.revisionNo === 0);
    if (initialRevision) {
      await recordStatusChange(tx, {
        proposalId: proposal.id,
        revisionId: initialRevision.id,
        fromStatus: null,
        toStatus: ProjectProposalStatus.DRAFT,
        changedById: input.createdById,
        remarks: "Proposal created",
      });
    }

    const proposalWithHistory = await tx.projectProposal.findUniqueOrThrow({
      where: { id: proposal.id },
      include: projectProposalInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      newValue: {
        proposalNo,
        packageCode: pkg.code,
        finalAmount: snapshot.finalAmount,
        discountAmount: snapshot.discountAmount,
      },
    });

    return {
      proposal: serializeProjectProposal(proposalWithHistory),
      pricing: serializePricingBreakdown(breakdown),
    };
  });
}

export async function updateProjectProposalDraft(
  prisma: PrismaClient,
  input: {
    proposalId: string;
    companyId: string;
    updatedById: string;
    userRoles: string[];
    form: ProjectProposalFormInput;
  },
) {
  const proposal = await loadProposalOrThrow(prisma, input.companyId, input.proposalId);
  assertProjectProposalEditable(input.userRoles, input.updatedById, proposal);

  const revision = proposal.revisions.find(
    (entry) => entry.revisionNo === proposal.currentRevisionNo,
  );
  if (!revision) {
    throw new Error("REVISION_NOT_FOUND");
  }

  const built = await buildRevisionWriteData(prisma, input.form, input.updatedById);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.projectProposal.update({
      where: { id: proposal.id },
      data: {
        updatedById: input.updatedById,
        ...(proposal.status === ProjectProposalStatus.REJECTED
          ? { status: ProjectProposalStatus.DRAFT }
          : {}),
        revisions: {
          update: {
            where: { id: revision.id },
            data: {
              ...built.revisionData,
              createdById: revision.createdById,
            },
          },
        },
        ...(proposal.status === ProjectProposalStatus.REJECTED
          ? {
              statusHistory: {
                create: {
                  revisionId: revision.id,
                  fromStatus: ProjectProposalStatus.REJECTED,
                  toStatus: ProjectProposalStatus.DRAFT,
                  changedById: input.updatedById,
                  remarks: "Proposal reopened for editing after rejection",
                },
              },
            }
          : {}),
      },
      include: projectProposalInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "UPDATE",
      performedBy: input.updatedById,
      companyId: input.companyId,
      newValue: {
        finalAmount: built.snapshot.finalAmount,
        discountAmount: built.snapshot.discountAmount,
      },
    });

    return {
      proposal: serializeProjectProposal(updated),
      pricing: serializePricingBreakdown(built.breakdown),
    };
  });
}

function getCurrentRevisionRecord(proposal: ProjectProposalRecord) {
  const revision =
    proposal.revisions.find((entry) => entry.revisionNo === proposal.currentRevisionNo) ??
    proposal.revisions[proposal.revisions.length - 1];
  if (!revision) {
    throw new Error("REVISION_NOT_FOUND");
  }
  return revision;
}

export async function sendProjectProposal(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proposalId: string;
    performedById: string;
    userRoles: string[];
  },
) {
  const proposal = await loadProposalOrThrow(prisma, input.companyId, input.proposalId);
  assertProjectProposalAccess(input.userRoles, input.performedById, proposal);

  if (proposal.status !== ProjectProposalStatus.DRAFT) {
    throw new Error("INVALID_STATUS");
  }

  const revision = getCurrentRevisionRecord(proposal);
  const discountAmount = decimalToNumber(revision.discountAmount);
  if (discountAmount > DISCOUNT_APPROVAL_THRESHOLD) {
    throw new Error("DISCOUNT_APPROVAL_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    await recordStatusChange(tx, {
      proposalId: proposal.id,
      revisionId: revision.id,
      fromStatus: ProjectProposalStatus.DRAFT,
      toStatus: ProjectProposalStatus.SENT,
      changedById: input.performedById,
      remarks: "Proposal sent to customer",
    });

    await recordStatusChange(tx, {
      proposalId: proposal.id,
      revisionId: revision.id,
      fromStatus: ProjectProposalStatus.SENT,
      toStatus: ProjectProposalStatus.APPROVED,
      changedById: input.performedById,
      remarks: "Auto-approved because discount is within limit",
    });

    const approved = await tx.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: ProjectProposalStatus.APPROVED,
        updatedById: input.performedById,
      },
      include: projectProposalInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { status: ProjectProposalStatus.APPROVED, discountAmount },
      reference: proposal.proposalNo,
    });

    return serializeProjectProposal(approved);
  });
}

export async function submitProjectProposalForApproval(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proposalId: string;
    performedById: string;
    userRoles: string[];
  },
) {
  const proposal = await loadProposalOrThrow(prisma, input.companyId, input.proposalId);
  assertProjectProposalAccess(input.userRoles, input.performedById, proposal);

  if (proposal.status !== ProjectProposalStatus.DRAFT) {
    throw new Error("INVALID_STATUS");
  }

  const revision = getCurrentRevisionRecord(proposal);
  const discountAmount = decimalToNumber(revision.discountAmount);
  if (discountAmount <= DISCOUNT_APPROVAL_THRESHOLD) {
    throw new Error("APPROVAL_NOT_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const pending = await tx.projectProposalApproval.findFirst({
      where: {
        proposalId: proposal.id,
        revisionId: revision.id,
        status: ProjectProposalApprovalStatus.PENDING,
      },
    });

    if (!pending) {
      await tx.projectProposalApproval.create({
        data: {
          proposalId: proposal.id,
          revisionId: revision.id,
          status: ProjectProposalApprovalStatus.PENDING,
          discountAmount,
          requestedById: input.performedById,
        },
      });
    }

    const updated = await tx.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: ProjectProposalStatus.PENDING_APPROVAL,
        updatedById: input.performedById,
      },
      include: projectProposalInclude,
    });

    await recordStatusChange(tx, {
      proposalId: proposal.id,
      revisionId: revision.id,
      fromStatus: ProjectProposalStatus.DRAFT,
      toStatus: ProjectProposalStatus.PENDING_APPROVAL,
      changedById: input.performedById,
      remarks: "Submitted for manager approval",
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { status: ProjectProposalStatus.PENDING_APPROVAL, discountAmount },
      reference: proposal.proposalNo,
    });

    return serializeProjectProposal(updated);
  });
}

export async function approveProjectProposal(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proposalId: string;
    performedById: string;
    remarks?: string;
  },
) {
  const proposal = await loadProposalOrThrow(prisma, input.companyId, input.proposalId);

  if (proposal.status !== ProjectProposalStatus.PENDING_APPROVAL) {
    throw new Error("INVALID_STATUS");
  }

  const revision = getCurrentRevisionRecord(proposal);
  const approval = await prisma.projectProposalApproval.findFirst({
    where: {
      proposalId: proposal.id,
      revisionId: revision.id,
      status: ProjectProposalApprovalStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!approval) {
    throw new Error("APPROVAL_NOT_PENDING");
  }

  return prisma.$transaction(async (tx) => {
    await tx.projectProposalApproval.update({
      where: { id: approval.id },
      data: {
        status: ProjectProposalApprovalStatus.APPROVED,
        decidedById: input.performedById,
        remarks: input.remarks,
      },
    });

    const updated = await tx.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: ProjectProposalStatus.APPROVED,
        updatedById: input.performedById,
      },
      include: projectProposalInclude,
    });

    await recordStatusChange(tx, {
      proposalId: proposal.id,
      revisionId: revision.id,
      fromStatus: ProjectProposalStatus.PENDING_APPROVAL,
      toStatus: ProjectProposalStatus.APPROVED,
      changedById: input.performedById,
      remarks: input.remarks ?? "Approved by manager",
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "APPROVE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { status: ProjectProposalStatus.APPROVED },
      reference: proposal.proposalNo,
    });

    return serializeProjectProposal(updated);
  });
}

export async function rejectProjectProposal(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proposalId: string;
    performedById: string;
    reason: string;
  },
) {
  if (!input.reason.trim()) {
    throw new Error("REJECT_REASON_REQUIRED");
  }

  const proposal = await loadProposalOrThrow(prisma, input.companyId, input.proposalId);

  if (proposal.status !== ProjectProposalStatus.PENDING_APPROVAL) {
    throw new Error("INVALID_STATUS");
  }

  const revision = getCurrentRevisionRecord(proposal);
  const approval = await prisma.projectProposalApproval.findFirst({
    where: {
      proposalId: proposal.id,
      revisionId: revision.id,
      status: ProjectProposalApprovalStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!approval) {
    throw new Error("APPROVAL_NOT_PENDING");
  }

  return prisma.$transaction(async (tx) => {
    await tx.projectProposalApproval.update({
      where: { id: approval.id },
      data: {
        status: ProjectProposalApprovalStatus.REJECTED,
        decidedById: input.performedById,
        remarks: input.reason,
      },
    });

    const updated = await tx.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: ProjectProposalStatus.REJECTED,
        updatedById: input.performedById,
      },
      include: projectProposalInclude,
    });

    await recordStatusChange(tx, {
      proposalId: proposal.id,
      revisionId: revision.id,
      fromStatus: ProjectProposalStatus.PENDING_APPROVAL,
      toStatus: ProjectProposalStatus.REJECTED,
      changedById: input.performedById,
      remarks: input.reason,
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { status: ProjectProposalStatus.REJECTED, reason: input.reason },
      reference: proposal.proposalNo,
    });

    return serializeProjectProposal(updated);
  });
}

export async function reviseProjectProposal(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proposalId: string;
    createdById: string;
    userRoles: string[];
    form: ProjectProposalFormInput;
  },
) {
  const proposal = await loadProposalOrThrow(prisma, input.companyId, input.proposalId);
  assertProjectProposalAccess(input.userRoles, input.createdById, proposal);

  if (proposal.status === ProjectProposalStatus.DRAFT) {
    throw new Error("DRAFT_CANNOT_REVISE");
  }
  if (proposal.status === ProjectProposalStatus.CONVERTED) {
    throw new Error("ALREADY_CONVERTED");
  }
  if (proposal.status === ProjectProposalStatus.PENDING_APPROVAL) {
    throw new Error("INVALID_STATUS");
  }

  const nextRevisionNo = getNextProjectProposalRevisionNo(proposal.currentRevisionNo);
  const built = await buildRevisionWriteData(prisma, input.form, input.createdById);

  return prisma.$transaction(async (tx) => {
    const newRevision = await tx.projectProposalRevision.create({
      data: {
        proposalId: proposal.id,
        revisionNo: nextRevisionNo,
        ...built.revisionData,
        createdById: input.createdById,
      },
    });

    const updated = await tx.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: ProjectProposalStatus.DRAFT,
        currentRevisionNo: nextRevisionNo,
        updatedById: input.createdById,
      },
      include: projectProposalInclude,
    });

    await recordStatusChange(tx, {
      proposalId: proposal.id,
      revisionId: newRevision.id,
      fromStatus: proposal.status,
      toStatus: ProjectProposalStatus.DRAFT,
      changedById: input.createdById,
      remarks: `Revision ${nextRevisionNo} created`,
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "UPDATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      oldValue: { revisionNo: proposal.currentRevisionNo, status: proposal.status },
      newValue: { revisionNo: nextRevisionNo, status: ProjectProposalStatus.DRAFT },
      reference: proposal.proposalNo,
    });

    return {
      proposal: serializeProjectProposal(updated),
      pricing: serializePricingBreakdown(built.breakdown),
    };
  });
}

export async function convertProjectProposalToProject(
  prisma: PrismaClient,
  input: {
    companyId: string;
    proposalId: string;
    performedById: string;
    userRoles: string[];
  },
) {
  const proposal = await loadProposalOrThrow(prisma, input.companyId, input.proposalId);
  assertProjectProposalAccess(input.userRoles, input.performedById, proposal);

  if (proposal.status === ProjectProposalStatus.CONVERTED) {
    throw new Error("ALREADY_CONVERTED");
  }
  if (proposal.status !== ProjectProposalStatus.APPROVED) {
    throw new Error("NOT_APPROVED");
  }

  return prisma.$transaction(async (tx) => {
    const revision = getCurrentRevisionRecord(proposal);
    const updated = await tx.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: ProjectProposalStatus.CONVERTED,
        convertedAt: new Date(),
        convertedById: input.performedById,
        updatedById: input.performedById,
      },
      include: projectProposalInclude,
    });

    await recordStatusChange(tx, {
      proposalId: proposal.id,
      revisionId: revision.id,
      fromStatus: ProjectProposalStatus.APPROVED,
      toStatus: ProjectProposalStatus.CONVERTED,
      changedById: input.performedById,
      remarks: "Converted to project",
    });

    await writeAuditLogTx(tx, {
      tableName: "project_proposals",
      recordId: proposal.id,
      action: "UPDATE",
      performedBy: input.performedById,
      companyId: input.companyId,
      newValue: { status: ProjectProposalStatus.CONVERTED },
      reference: proposal.proposalNo,
    });

    return serializeProjectProposal(updated);
  });
}
