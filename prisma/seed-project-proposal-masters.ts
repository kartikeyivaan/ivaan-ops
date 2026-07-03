import type { PrismaClient } from "@prisma/client";

const PACKAGE_MASTERS = [
  {
    code: "P1",
    name: "530+Wp × 6 Panels, 3.3kW",
    description: "530+Wp × 6 Panels, 3.3kW Polycab/Deye",
    panelWp: 530,
    panelCount: 6,
    systemKw: 3.3,
    defaultInverterBrands: ["Polycab", "Deye"],
    basePrice: 185_000,
    isActive: true,
    isComingSoon: false,
    sortOrder: 1,
  },
  {
    code: "P2",
    name: "570+Wp × 6 Panels, 3.3kW",
    description: "570+Wp × 6 Panels, 3.3kW Polycab/Deye",
    panelWp: 570,
    panelCount: 6,
    systemKw: 3.3,
    defaultInverterBrands: ["Polycab", "Deye"],
    basePrice: 195_000,
    isActive: true,
    isComingSoon: false,
    sortOrder: 2,
  },
  {
    code: "P3",
    name: "530+Wp × 9 Panels, 5kW",
    description: "530+Wp × 9 Panels, 5kW Polycab/Deye",
    panelWp: 530,
    panelCount: 9,
    systemKw: 5,
    defaultInverterBrands: ["Polycab", "Deye"],
    basePrice: 250_000,
    isActive: true,
    isComingSoon: false,
    sortOrder: 3,
  },
  {
    code: "P4",
    name: "570+Wp × 9 Panels, 5kW",
    description: "570+Wp × 9 Panels, 5kW Polycab/Deye",
    panelWp: 570,
    panelCount: 9,
    systemKw: 5,
    defaultInverterBrands: ["Polycab", "Deye"],
    basePrice: 270_000,
    isActive: true,
    isComingSoon: false,
    sortOrder: 4,
  },
  {
    code: "P610",
    name: "610+Wp Package",
    description: "610+Wp Package — Coming Soon",
    panelWp: 610,
    panelCount: 6,
    systemKw: 3.3,
    defaultInverterBrands: ["Polycab", "Deye"],
    basePrice: 0,
    isActive: false,
    isComingSoon: true,
    sortOrder: 5,
  },
] as const;

const INVERTER_BRAND_MASTERS = [
  {
    code: "POLYCAB",
    name: "Polycab",
    brandUpgradeAmount: 0,
    isActive: true,
    isComingSoon: false,
    sortOrder: 1,
  },
  {
    code: "DEYE",
    name: "Deye",
    brandUpgradeAmount: 0,
    isActive: true,
    isComingSoon: false,
    sortOrder: 2,
  },
  {
    code: "WAAREE",
    name: "Waaree",
    brandUpgradeAmount: 5_000,
    isActive: true,
    isComingSoon: false,
    sortOrder: 3,
  },
  {
    code: "SOLAREDGE",
    name: "SolarEdge",
    brandUpgradeAmount: 5_000,
    isActive: true,
    isComingSoon: false,
    sortOrder: 4,
  },
  {
    code: "PURE_HYBRID",
    name: "Pure Hybrid",
    brandUpgradeAmount: 0,
    isActive: false,
    isComingSoon: true,
    sortOrder: 5,
  },
] as const;

const INVERTER_UPGRADE_MASTERS = [
  {
    packagePanelCount: 6,
    upgradeKw: 4,
    label: "4kW Inverter Upgrade",
    upgradeAmount: 13_500,
    isActive: true,
    sortOrder: 1,
  },
  {
    packagePanelCount: 6,
    upgradeKw: 5,
    label: "5kW Inverter Upgrade",
    upgradeAmount: 15_000,
    isActive: true,
    sortOrder: 2,
  },
  {
    packagePanelCount: 6,
    upgradeKw: 6,
    label: "6kW Inverter Upgrade",
    upgradeAmount: 17_000,
    isActive: true,
    sortOrder: 3,
  },
  {
    packagePanelCount: 9,
    upgradeKw: 6,
    label: "6kW Inverter Upgrade",
    upgradeAmount: 2_000,
    isActive: true,
    sortOrder: 4,
  },
] as const;

export async function seedProjectProposalMasters(prisma: PrismaClient) {
  for (const pkg of PACKAGE_MASTERS) {
    await prisma.proposalPackageMaster.upsert({
      where: { code: pkg.code },
      update: {
        name: pkg.name,
        description: pkg.description,
        panelWp: pkg.panelWp,
        panelCount: pkg.panelCount,
        systemKw: pkg.systemKw,
        defaultInverterBrands: [...pkg.defaultInverterBrands],
        basePrice: pkg.basePrice,
        isActive: pkg.isActive,
        isComingSoon: pkg.isComingSoon,
        sortOrder: pkg.sortOrder,
      },
      create: {
        code: pkg.code,
        name: pkg.name,
        description: pkg.description,
        panelWp: pkg.panelWp,
        panelCount: pkg.panelCount,
        systemKw: pkg.systemKw,
        defaultInverterBrands: [...pkg.defaultInverterBrands],
        basePrice: pkg.basePrice,
        isActive: pkg.isActive,
        isComingSoon: pkg.isComingSoon,
        sortOrder: pkg.sortOrder,
      },
    });
  }

  for (const brand of INVERTER_BRAND_MASTERS) {
    await prisma.proposalInverterBrandMaster.upsert({
      where: { code: brand.code },
      update: {
        name: brand.name,
        brandUpgradeAmount: brand.brandUpgradeAmount,
        isActive: brand.isActive,
        isComingSoon: brand.isComingSoon,
        sortOrder: brand.sortOrder,
      },
      create: {
        code: brand.code,
        name: brand.name,
        brandUpgradeAmount: brand.brandUpgradeAmount,
        isActive: brand.isActive,
        isComingSoon: brand.isComingSoon,
        sortOrder: brand.sortOrder,
      },
    });
  }

  for (const upgrade of INVERTER_UPGRADE_MASTERS) {
    const existing = await prisma.proposalInverterUpgradeMaster.findFirst({
      where: {
        packagePanelCount: upgrade.packagePanelCount,
        upgradeKw: upgrade.upgradeKw,
      },
    });

    if (existing) {
      await prisma.proposalInverterUpgradeMaster.update({
        where: { id: existing.id },
        data: {
          label: upgrade.label,
          upgradeAmount: upgrade.upgradeAmount,
          isActive: upgrade.isActive,
          sortOrder: upgrade.sortOrder,
        },
      });
    } else {
      await prisma.proposalInverterUpgradeMaster.create({
        data: {
          packagePanelCount: upgrade.packagePanelCount,
          upgradeKw: upgrade.upgradeKw,
          label: upgrade.label,
          upgradeAmount: upgrade.upgradeAmount,
          isActive: upgrade.isActive,
          sortOrder: upgrade.sortOrder,
        },
      });
    }
  }
}
