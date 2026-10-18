import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decimalToNumber } from "@/lib/inventory";
import { projectProposalErrorResponse } from "@/lib/project-proposal-api";
import { canManageProjectProposals } from "@/lib/project-proposal-permissions";
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

  const [packages, brands, upgrades, modulesCategory] = await Promise.all([
    prisma.proposalPackageMaster.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        moduleOptions: {
          orderBy: { sortOrder: "asc" },
          include: {
            product: {
              select: {
                id: true,
                displayName: true,
                capacity: true,
                capacityUnit: true,
              },
            },
          },
        },
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
        packageId: true,
        packagePanelCount: true,
        upgradeKw: true,
        label: true,
        upgradeAmount: true,
      },
    }),
    prisma.productCategory.findUnique({
      where: { name: "Modules" },
      select: { id: true },
    }),
  ]);

  const moduleProducts = modulesCategory
    ? await prisma.product.findMany({
        where: { categoryId: modulesCategory.id, isActive: true },
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          displayName: true,
          capacity: true,
          capacityUnit: true,
        },
      })
    : [];

  return NextResponse.json({
    packages: packages.map((pkg) => ({
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      description: pkg.description,
      packageType: pkg.packageType,
      panelWp: pkg.panelWp,
      panelCount: pkg.panelCount,
      systemKw: decimalToNumber(pkg.systemKw),
      basePrice: decimalToNumber(pkg.basePrice),
      dcrAdditionalPanelRate:
        pkg.dcrAdditionalPanelRate != null
          ? decimalToNumber(pkg.dcrAdditionalPanelRate)
          : null,
      ndcrAdditionalPanelRate:
        pkg.ndcrAdditionalPanelRate != null
          ? decimalToNumber(pkg.ndcrAdditionalPanelRate)
          : null,
      futureStructurePanelRate:
        pkg.futureStructurePanelRate != null
          ? decimalToNumber(pkg.futureStructurePanelRate)
          : null,
      moduleSegmentLabel: pkg.moduleSegmentLabel,
      hybridBasePrice:
        pkg.hybridBasePrice != null ? decimalToNumber(pkg.hybridBasePrice) : null,
      hybridPerInverterKwRate:
        pkg.hybridPerInverterKwRate != null
          ? decimalToNumber(pkg.hybridPerInverterKwRate)
          : null,
      hybridPerBatteryUnitRate:
        pkg.hybridPerBatteryUnitRate != null
          ? decimalToNumber(pkg.hybridPerBatteryUnitRate)
          : null,
      batteryUnitKwh:
        pkg.batteryUnitKwh != null ? decimalToNumber(pkg.batteryUnitKwh) : null,
      isActive: pkg.isActive,
      isComingSoon: pkg.isComingSoon,
      moduleOptions: pkg.moduleOptions.map((option) => ({
        id: option.id,
        productId: option.productId,
        isDefault: option.isDefault,
        sortOrder: option.sortOrder,
        product: {
          ...option.product,
          capacity: decimalToNumber(option.product.capacity),
        },
      })),
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
    moduleProducts: moduleProducts.map((product) => ({
      ...product,
      capacity: decimalToNumber(product.capacity),
    })),
  });
}
