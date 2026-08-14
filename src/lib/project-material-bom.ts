import {
  ProjectMaterialLineSource,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  resolveInverterKw,
  totalProposedPanelCount,
} from "@/lib/proposal-bom";
import { decimalToNumber } from "@/lib/inventory";
import type { projectProposalRevisionInclude } from "@/lib/project-proposal-service";

type RevisionRecord = Prisma.ProjectProposalRevisionGetPayload<{
  include: typeof projectProposalRevisionInclude;
}>;

export type MaterialLineSeed = {
  productId: string;
  requiredQty: number;
  source: ProjectMaterialLineSource;
  sortOrder: number;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Maps module product and optional inverter product from a proposal revision.
 */
export async function deriveMaterialLinesFromRevision(
  prisma: DbClient,
  revision: RevisionRecord,
): Promise<MaterialLineSeed[]> {
  const lines: MaterialLineSeed[] = [];
  let sortOrder = 0;

  const panelCount =
    revision.moduleQty ??
    totalProposedPanelCount({
      panelCount: revision.package.panelCount,
      dcrAdditionalPanels: revision.dcrAdditionalPanels,
      ndcrAdditionalPanels: revision.ndcrAdditionalPanels,
      futureStructurePanels: revision.futureStructurePanels,
    });

  if (revision.moduleProductId && panelCount > 0) {
    lines.push({
      productId: revision.moduleProductId,
      requiredQty: panelCount,
      source: ProjectMaterialLineSource.PROPOSAL,
      sortOrder: sortOrder++,
    });
  }

  const inverterKw = resolveInverterKw(
    revision.inverterCapacityKw != null
      ? decimalToNumber(revision.inverterCapacityKw)
      : revision.inverterUpgrade?.upgradeKw != null
        ? decimalToNumber(revision.inverterUpgrade.upgradeKw)
        : null,
  );

  const inverter = await prisma.product.findFirst({
    where: {
      isActive: true,
      category: { name: "Inverters" },
      capacity: { gte: inverterKw - 0.5, lte: inverterKw + 0.5 },
    },
    orderBy: { capacity: "asc" },
  });

  if (inverter) {
    lines.push({
      productId: inverter.id,
      requiredQty: 1,
      source: ProjectMaterialLineSource.PROPOSAL,
      sortOrder: sortOrder++,
    });
  }

  return lines;
}
