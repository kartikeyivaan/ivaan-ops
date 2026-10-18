import {
  Prisma,
  ProposalPackageType,
  type PrismaClient,
} from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { NDCR_COMPLETE_PACKAGE_CODE } from "@/lib/project-proposal-packages";

export type ProposalPackageModuleOptionInput = {
  productId: string;
  isDefault?: boolean;
  sortOrder?: number;
};

export type ProposalPackageInverterUpgradeInput = {
  upgradeKw: number;
  label: string;
  upgradeAmount: number;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpsertProposalPackageInput = {
  code: string;
  name: string;
  description?: string | null;
  packageType: ProposalPackageType;
  panelWp: number;
  panelCount: number;
  systemKw: number;
  defaultInverterBrands: string[];
  basePrice: number;
  dcrAdditionalPanelRate?: number | null;
  ndcrAdditionalPanelRate?: number | null;
  futureStructurePanelRate?: number | null;
  moduleSegmentLabel?: string | null;
  hybridBasePrice?: number | null;
  hybridPerInverterKwRate?: number | null;
  hybridPerBatteryUnitRate?: number | null;
  batteryUnitKwh?: number | null;
  isActive?: boolean;
  isComingSoon?: boolean;
  sortOrder?: number;
  moduleOptions?: ProposalPackageModuleOptionInput[];
  inverterUpgrades?: ProposalPackageInverterUpgradeInput[];
};

function mapModuleOption(
  row: Prisma.ProposalPackageModuleOptionGetPayload<{
    include: {
      product: {
        select: {
          id: true;
          displayName: true;
          capacity: true;
          capacityUnit: true;
          isActive: true;
        };
      };
    };
  }>,
) {
  return {
    id: row.id,
    productId: row.productId,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    product: {
      ...row.product,
      capacity: decimalToNumber(row.product.capacity),
    },
  };
}

export function serializeProposalPackage(
  pkg: Prisma.ProposalPackageMasterGetPayload<{
    include: {
      moduleOptions: {
        include: {
          product: {
            select: {
              id: true;
              displayName: true;
              capacity: true;
              capacityUnit: true;
              isActive: true;
            };
          };
        };
      };
    };
  }>,
) {
  return {
    id: pkg.id,
    code: pkg.code,
    name: pkg.name,
    description: pkg.description,
    packageType: pkg.packageType,
    panelWp: pkg.panelWp,
    panelCount: pkg.panelCount,
    systemKw: decimalToNumber(pkg.systemKw),
    defaultInverterBrands: pkg.defaultInverterBrands as string[],
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
    sortOrder: pkg.sortOrder,
    moduleOptions: pkg.moduleOptions
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(mapModuleOption),
    inverterUpgrades: pkg.inverterUpgrades
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => ({
        id: row.id,
        upgradeKw: decimalToNumber(row.upgradeKw),
        label: row.label,
        upgradeAmount: decimalToNumber(row.upgradeAmount),
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      })),
  };
}

async function syncPackageInverterUpgrades(
  tx: Prisma.TransactionClient,
  packageId: string,
  panelCount: number,
  upgrades: ProposalPackageInverterUpgradeInput[] | undefined,
) {
  if (upgrades === undefined) {
    return;
  }

  await tx.proposalInverterUpgradeMaster.deleteMany({ where: { packageId } });
  if (upgrades.length === 0) {
    return;
  }

  await tx.proposalInverterUpgradeMaster.createMany({
    data: upgrades.map((upgrade, index) => ({
      packageId,
      packagePanelCount: panelCount,
      upgradeKw: upgrade.upgradeKw,
      label: upgrade.label.trim(),
      upgradeAmount: upgrade.upgradeAmount,
      isActive: upgrade.isActive ?? true,
      sortOrder: upgrade.sortOrder ?? index,
    })),
  });
}

const packageInclude = {
  inverterUpgrades: {
    orderBy: { sortOrder: "asc" as const },
  },
  moduleOptions: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          capacity: true,
          capacityUnit: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.ProposalPackageMasterInclude;

async function validateModuleOptions(
  prisma: PrismaClient,
  moduleOptions: ProposalPackageModuleOptionInput[] | undefined,
) {
  if (!moduleOptions?.length) {
    return;
  }

  const defaultCount = moduleOptions.filter((option) => option.isDefault).length;
  if (defaultCount > 1) {
    throw new Error("PACKAGE_MODULE_DEFAULT_INVALID");
  }

  const productIds = moduleOptions.map((option) => option.productId);
  const uniqueIds = new Set(productIds);
  if (uniqueIds.size !== productIds.length) {
    throw new Error("PACKAGE_MODULE_DUPLICATE");
  }

  const modulesCategory = await prisma.productCategory.findUnique({
    where: { name: "Modules" },
    select: { id: true },
  });
  if (!modulesCategory) {
    throw new Error("MODULES_CATEGORY_NOT_FOUND");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, categoryId: true, isActive: true },
  });
  if (products.length !== productIds.length) {
    throw new Error("PACKAGE_MODULE_PRODUCT_NOT_FOUND");
  }

  const invalid = products.find(
    (product) => product.categoryId !== modulesCategory.id || !product.isActive,
  );
  if (invalid) {
    throw new Error("PACKAGE_MODULE_PRODUCT_INVALID");
  }
}

export async function listProposalPackages(prisma: PrismaClient) {
  const rows = await prisma.proposalPackageMaster.findMany({
    orderBy: { sortOrder: "asc" },
    include: packageInclude,
  });
  return rows.map(serializeProposalPackage);
}

export async function getProposalPackage(prisma: PrismaClient, id: string) {
  const row = await prisma.proposalPackageMaster.findUnique({
    where: { id },
    include: packageInclude,
  });
  if (!row) {
    throw new Error("PACKAGE_NOT_FOUND");
  }
  return serializeProposalPackage(row);
}

export async function createProposalPackage(
  prisma: PrismaClient,
  input: UpsertProposalPackageInput,
) {
  await validateModuleOptions(prisma, input.moduleOptions);

  const existingCode = await prisma.proposalPackageMaster.findUnique({
    where: { code: input.code.trim().toUpperCase() },
    select: { id: true },
  });
  if (existingCode) {
    throw new Error("PACKAGE_CODE_EXISTS");
  }

  const moduleOptions = input.moduleOptions ?? [];
  const hasDefault = moduleOptions.some((option) => option.isDefault);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.proposalPackageMaster.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      packageType: input.packageType,
      panelWp: input.panelWp,
      panelCount: input.panelCount,
      systemKw: input.systemKw,
      defaultInverterBrands: input.defaultInverterBrands,
      basePrice: input.basePrice,
      dcrAdditionalPanelRate: input.dcrAdditionalPanelRate ?? null,
      ndcrAdditionalPanelRate: input.ndcrAdditionalPanelRate ?? null,
      futureStructurePanelRate: input.futureStructurePanelRate ?? null,
      moduleSegmentLabel: input.moduleSegmentLabel?.trim() || null,
      hybridBasePrice: input.hybridBasePrice ?? null,
      hybridPerInverterKwRate: input.hybridPerInverterKwRate ?? null,
      hybridPerBatteryUnitRate: input.hybridPerBatteryUnitRate ?? null,
      batteryUnitKwh: input.batteryUnitKwh ?? null,
      isActive: input.isActive ?? true,
      isComingSoon: input.isComingSoon ?? false,
      sortOrder: input.sortOrder ?? 0,
      moduleOptions: moduleOptions.length
        ? {
            create: moduleOptions.map((option, index) => ({
              productId: option.productId,
              isDefault: option.isDefault ?? (!hasDefault && index === 0),
              sortOrder: option.sortOrder ?? index,
            })),
          }
        : undefined,
    },
    include: packageInclude,
  });

    await syncPackageInverterUpgrades(
      tx,
      row.id,
      input.panelCount,
      input.inverterUpgrades,
    );

    return tx.proposalPackageMaster.findUniqueOrThrow({
      where: { id: row.id },
      include: packageInclude,
    });
  });

  return serializeProposalPackage(created);
}

export async function updateProposalPackage(
  prisma: PrismaClient,
  id: string,
  input: UpsertProposalPackageInput,
) {
  await validateModuleOptions(prisma, input.moduleOptions);

  const existing = await prisma.proposalPackageMaster.findUnique({
    where: { id },
    select: { id: true, code: true },
  });
  if (!existing) {
    throw new Error("PACKAGE_NOT_FOUND");
  }

  const nextCode = input.code.trim().toUpperCase();
  if (
    nextCode !== existing.code &&
    existing.code === NDCR_COMPLETE_PACKAGE_CODE
  ) {
    throw new Error("PACKAGE_CODE_IMMUTABLE");
  }

  if (nextCode !== existing.code) {
    const codeTaken = await prisma.proposalPackageMaster.findUnique({
      where: { code: nextCode },
      select: { id: true },
    });
    if (codeTaken) {
      throw new Error("PACKAGE_CODE_EXISTS");
    }
  }

  const moduleOptions = input.moduleOptions ?? [];
  const hasDefault = moduleOptions.some((option) => option.isDefault);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.proposalPackageModuleOption.deleteMany({ where: { packageId: id } });

    await tx.proposalPackageMaster.update({
      where: { id },
      data: {
        code: nextCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        packageType: input.packageType,
        panelWp: input.panelWp,
        panelCount: input.panelCount,
        systemKw: input.systemKw,
        defaultInverterBrands: input.defaultInverterBrands,
        basePrice: input.basePrice,
        dcrAdditionalPanelRate: input.dcrAdditionalPanelRate ?? null,
        ndcrAdditionalPanelRate: input.ndcrAdditionalPanelRate ?? null,
        futureStructurePanelRate: input.futureStructurePanelRate ?? null,
        moduleSegmentLabel: input.moduleSegmentLabel?.trim() || null,
        hybridBasePrice: input.hybridBasePrice ?? null,
        hybridPerInverterKwRate: input.hybridPerInverterKwRate ?? null,
        hybridPerBatteryUnitRate: input.hybridPerBatteryUnitRate ?? null,
        batteryUnitKwh: input.batteryUnitKwh ?? null,
        isActive: input.isActive ?? true,
        isComingSoon: input.isComingSoon ?? false,
        sortOrder: input.sortOrder ?? 0,
        moduleOptions: moduleOptions.length
          ? {
              create: moduleOptions.map((option, index) => ({
                productId: option.productId,
                isDefault: option.isDefault ?? (!hasDefault && index === 0),
                sortOrder: option.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      include: packageInclude,
    });

    await syncPackageInverterUpgrades(
      tx,
      id,
      input.panelCount,
      input.inverterUpgrades,
    );

    return tx.proposalPackageMaster.findUniqueOrThrow({
      where: { id },
      include: packageInclude,
    });
  });

  return serializeProposalPackage(updated);
}

export async function deactivateProposalPackage(prisma: PrismaClient, id: string) {
  const existing = await prisma.proposalPackageMaster.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("PACKAGE_NOT_FOUND");
  }

  const updated = await prisma.proposalPackageMaster.update({
    where: { id },
    data: { isActive: false },
    include: packageInclude,
  });

  return serializeProposalPackage(updated);
}
