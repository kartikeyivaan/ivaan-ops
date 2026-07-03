import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
import { decimalToNumber } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageProjectProposals(session.user.roles)) {
    return projectProposalErrorResponse(
      "FORBIDDEN",
      "You do not have permission for this action.",
      403,
    );
  }

  const [packages, brands, upgrades] = await Promise.all([
    prisma.proposalPackageMaster.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        panelWp: true,
        panelCount: true,
        systemKw: true,
        basePrice: true,
        isActive: true,
        isComingSoon: true,
      },
    }),
    prisma.proposalInverterBrandMaster.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        brandUpgradeAmount: true,
        isActive: true,
        isComingSoon: true,
      },
    }),
    prisma.proposalInverterUpgradeMaster.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        packagePanelCount: true,
        upgradeKw: true,
        label: true,
        upgradeAmount: true,
      },
    }),
  ]);

  return NextResponse.json({
    packages: packages.map((pkg) => ({
      ...pkg,
      systemKw: decimalToNumber(pkg.systemKw),
      basePrice: decimalToNumber(pkg.basePrice),
    })),
    brands: brands.map((brand) => ({
      ...brand,
      brandUpgradeAmount: decimalToNumber(brand.brandUpgradeAmount),
    })),
    upgrades: upgrades.map((upgrade) => ({
      ...upgrade,
      upgradeKw: decimalToNumber(upgrade.upgradeKw),
      upgradeAmount: decimalToNumber(upgrade.upgradeAmount),
    })),
  });
}
