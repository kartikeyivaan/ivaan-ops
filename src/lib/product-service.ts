import {
  CapacityUnit,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  calculateKitSystemKwp,
  generateDisplayName,
  isKitCategory,
  KIT_DEFAULT_BRAND,
  resolvePricingType,
  resolveSerialTracking,
  type KitBomLineForName,
} from "@/lib/products";
import { decimalToNumber, type StockSummary } from "@/lib/inventory";
import { getProductStockSummary } from "@/lib/inventory-service";
import { isProductPriceEffectiveOn } from "@/lib/quotations";

const productInclude = {
  category: true,
  brand: true,
  technology: true,
  prices: {
    orderBy: { effectiveFrom: "desc" as const },
  },
  kitComponents: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      componentProduct: {
        include: {
          category: true,
          brand: true,
        },
      },
    },
  },
};

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
type ProductPriceRecord = ProductRecord["prices"][number];

function serializeMasterRecord(record: {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    name: record.name,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeProductPrice(price: ProductPriceRecord) {
  return {
    id: price.id,
    productId: price.productId,
    landingCost: decimalToNumber(price.landingCost),
    standardPrice: decimalToNumber(price.standardPrice),
    minimumPrice: decimalToNumber(price.minimumPrice),
    effectiveFrom: price.effectiveFrom.toISOString(),
    effectiveTo: price.effectiveTo?.toISOString() ?? null,
    createdAt: price.createdAt.toISOString(),
    updatedAt: price.updatedAt.toISOString(),
  };
}

function serializeKitComponent(
  component: ProductRecord["kitComponents"][number],
) {
  return {
    id: component.id,
    productId: component.componentProductId,
    qty: decimalToNumber(component.qty),
    sortOrder: component.sortOrder,
    product: {
      id: component.componentProduct.id,
      displayName: component.componentProduct.displayName,
      serialTracking: component.componentProduct.serialTracking,
      capacity: decimalToNumber(component.componentProduct.capacity),
      capacityUnit: component.componentProduct.capacityUnit,
      category: serializeMasterRecord(component.componentProduct.category),
      brand: serializeMasterRecord(component.componentProduct.brand),
    },
  };
}

function serializeProductRecord(
  product: ProductRecord,
  stock: StockSummary,
) {
  const currentPrice = getCurrentPrice(product.prices);
  const isKit = isKitCategory(product.category.name);

  return {
    id: product.id,
    categoryId: product.categoryId,
    brandId: product.brandId,
    technologyId: product.technologyId,
    capacity: decimalToNumber(product.capacity),
    capacityUnit: product.capacityUnit,
    displayName: product.displayName,
    pricingType: product.pricingType,
    hsn: product.hsn,
    gstRate: decimalToNumber(product.gstRate),
    serialTracking: product.serialTracking,
    isActive: product.isActive,
    isKit,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    category: serializeMasterRecord(product.category),
    brand: serializeMasterRecord(product.brand),
    technology: product.technology
      ? serializeMasterRecord(product.technology)
      : null,
    prices: product.prices.map(serializeProductPrice),
    currentPrice: currentPrice ? serializeProductPrice(currentPrice) : null,
    kitComponents: product.kitComponents.map(serializeKitComponent),
    stock: isKit
      ? { availableStock: 0, incomingStock: 0, bookedStock: 0, damagedStock: 0 }
      : stock,
  };
}

export type ProductListItem = ReturnType<typeof serializeProductRecord>;

function getCurrentPrice(
  prices: ProductRecord["prices"],
): ProductRecord["prices"][number] | null {
  const now = new Date();
  return prices.find((price) => isProductPriceEffectiveOn(price, now)) ?? null;
}

export async function serializeProduct(
  prisma: PrismaClient,
  product: ProductRecord,
  companyId: string,
  stock?: StockSummary,
): Promise<ProductListItem> {
  const isKit = isKitCategory(product.category.name);
  return serializeProductRecord(
    product,
    isKit
      ? { availableStock: 0, incomingStock: 0, bookedStock: 0, damagedStock: 0 }
      : (stock ?? (await getProductStockSummary(prisma, companyId, product.id))),
  );
}

export async function listProducts(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    categoryId?: string;
    brandId?: string;
    isActive?: boolean;
  },
) {
  const where: Prisma.ProductWhereInput = {
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.brandId ? { brandId: filters.brandId } : {}),
    ...(filters.q
      ? {
          OR: [
            { displayName: { contains: filters.q, mode: "insensitive" } },
            { brand: { name: { contains: filters.q, mode: "insensitive" } } },
            { hsn: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
    include: productInclude,
    orderBy: { displayName: "asc" },
  });

  return Promise.all(products.map((product) => serializeProduct(prisma, product, companyId)));
}

export async function getProductById(
  prisma: PrismaClient,
  productId: string,
  companyId: string,
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: productInclude,
  });
  return product ? serializeProduct(prisma, product, companyId) : null;
}

async function upsertBrand(prisma: PrismaClient | Prisma.TransactionClient, name: string) {
  return prisma.brand.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function upsertTechnology(
  prisma: PrismaClient | Prisma.TransactionClient,
  name?: string | null,
) {
  if (!name?.trim()) return null;
  return prisma.productTechnology.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

type KitComponentInput = { productId: string; qty: number };

async function loadKitBomNameLines(
  prisma: PrismaClient | Prisma.TransactionClient,
  components: KitComponentInput[],
): Promise<{
  nameLines: KitBomLineForName[];
  resolved: Array<{
    componentProductId: string;
    qty: number;
    sortOrder: number;
    displayName: string;
    serialTracking: boolean;
    categoryName: string;
  }>;
}> {
  if (components.length === 0) {
    throw new Error("KIT_COMPONENTS_REQUIRED");
  }

  const ids = components.map((line) => line.productId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("KIT_DUPLICATE_COMPONENT");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { category: true, brand: true },
  });
  if (products.length !== ids.length) {
    throw new Error("KIT_COMPONENT_NOT_FOUND");
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  const nameLines: KitBomLineForName[] = [];
  const resolved: Array<{
    componentProductId: string;
    qty: number;
    sortOrder: number;
    displayName: string;
    serialTracking: boolean;
    categoryName: string;
  }> = [];

  for (const [index, line] of components.entries()) {
    const product = byId.get(line.productId);
    if (!product) throw new Error("KIT_COMPONENT_NOT_FOUND");
    if (isKitCategory(product.category.name)) {
      throw new Error("KIT_NESTED_NOT_ALLOWED");
    }

    nameLines.push({
      categoryName: product.category.name,
      brandName: product.brand.name,
      capacity: decimalToNumber(product.capacity),
      capacityUnit: product.capacityUnit,
      qty: line.qty,
    });
    resolved.push({
      componentProductId: product.id,
      qty: line.qty,
      sortOrder: index,
      displayName: product.displayName,
      serialTracking: product.serialTracking,
      categoryName: product.category.name,
    });
  }

  return { nameLines, resolved };
}

async function replaceKitComponents(
  tx: Prisma.TransactionClient,
  kitProductId: string,
  components: Array<{ componentProductId: string; qty: number; sortOrder: number }>,
) {
  await tx.kitComponent.deleteMany({ where: { kitProductId } });
  if (components.length === 0) return;
  await tx.kitComponent.createMany({
    data: components.map((component) => ({
      kitProductId,
      componentProductId: component.componentProductId,
      qty: component.qty,
      sortOrder: component.sortOrder,
    })),
  });
}

export async function createProduct(
  prisma: PrismaClient,
  input: {
    categoryId: string;
    brandName?: string;
    technologyName?: string | null;
    capacity?: number;
    capacityUnit?: CapacityUnit;
    hsn?: string;
    gstRate: number;
    isActive?: boolean;
    kitComponents?: KitComponentInput[];
    initialPrice?: {
      landingCost: number;
      standardPrice: number;
      minimumPrice: number;
      effectiveFrom?: Date;
    };
  },
) {
  const category = await prisma.productCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new Error("CATEGORY_NOT_FOUND");

  const isKit = isKitCategory(category.name);
  let kitResolved: Awaited<ReturnType<typeof loadKitBomNameLines>> | null = null;

  if (isKit) {
    kitResolved = await loadKitBomNameLines(prisma, input.kitComponents ?? []);
  } else {
    if (!input.brandName?.trim()) throw new Error("BRAND_REQUIRED");
    if (input.capacity == null || input.capacity <= 0) throw new Error("CAPACITY_REQUIRED");
    if (!input.capacityUnit) throw new Error("CAPACITY_UNIT_REQUIRED");
  }

  const brandName = isKit
    ? KIT_DEFAULT_BRAND
    : input.brandName!.trim();
  const brand = await upsertBrand(prisma, brandName);
  const technology = isKit
    ? null
    : await upsertTechnology(prisma, input.technologyName);

  const capacity = isKit
    ? calculateKitSystemKwp(kitResolved!.nameLines) || 1
    : input.capacity!;
  const capacityUnit = isKit ? CapacityUnit.KW : input.capacityUnit!;

  const displayName = generateDisplayName({
    categoryName: category.name,
    brandName: brand.name,
    technologyName: technology?.name,
    capacity,
    capacityUnit,
    kitComponents: kitResolved?.nameLines,
  });

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        categoryId: category.id,
        brandId: brand.id,
        technologyId: technology?.id ?? null,
        capacity,
        capacityUnit,
        displayName,
        pricingType: resolvePricingType(category.name),
        hsn: input.hsn,
        gstRate: input.gstRate,
        serialTracking: resolveSerialTracking(category.name),
        isActive: input.isActive ?? true,
      },
    });

    if (isKit && kitResolved) {
      await replaceKitComponents(tx, product.id, kitResolved.resolved);
    }

    if (input.initialPrice) {
      await tx.productPrice.create({
        data: {
          productId: product.id,
          landingCost: input.initialPrice.landingCost,
          standardPrice: input.initialPrice.standardPrice,
          minimumPrice: input.initialPrice.minimumPrice,
          effectiveFrom: input.initialPrice.effectiveFrom ?? new Date(),
        },
      });
    }

    const created = await tx.product.findUnique({
      where: { id: product.id },
      include: productInclude,
    });
    if (!created) throw new Error("CREATE_FAILED");
    return created;
  });
}

export async function updateProduct(
  prisma: PrismaClient,
  productId: string,
  input: {
    categoryId?: string;
    brandName?: string;
    technologyName?: string | null;
    capacity?: number;
    capacityUnit?: CapacityUnit;
    hsn?: string;
    gstRate?: number;
    isActive?: boolean;
    kitComponents?: KitComponentInput[];
  },
) {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: true,
      brand: true,
      technology: true,
      kitComponents: true,
    },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const category = input.categoryId
    ? await prisma.productCategory.findUnique({ where: { id: input.categoryId } })
    : existing.category;
  if (!category) throw new Error("CATEGORY_NOT_FOUND");

  const isKit = isKitCategory(category.name);
  let kitResolved: Awaited<ReturnType<typeof loadKitBomNameLines>> | null = null;

  if (isKit) {
    const components =
      input.kitComponents ??
      existing.kitComponents.map((line) => ({
        productId: line.componentProductId,
        qty: decimalToNumber(line.qty),
      }));
    kitResolved = await loadKitBomNameLines(prisma, components);
  }

  const brand = isKit
    ? await upsertBrand(prisma, KIT_DEFAULT_BRAND)
    : input.brandName
      ? await upsertBrand(prisma, input.brandName.trim())
      : existing.brand;

  const technology = isKit
    ? null
    : input.technologyName !== undefined
      ? await upsertTechnology(prisma, input.technologyName)
      : existing.technology;

  const capacity = isKit
    ? calculateKitSystemKwp(kitResolved!.nameLines) || 1
    : (input.capacity ?? Number(existing.capacity));
  const capacityUnit = isKit
    ? CapacityUnit.KW
    : (input.capacityUnit ?? existing.capacityUnit);

  if (!isKit) {
    if (!brand.name?.trim()) throw new Error("BRAND_REQUIRED");
    if (!(capacity > 0)) throw new Error("CAPACITY_REQUIRED");
  }

  const displayName = generateDisplayName({
    categoryName: category.name,
    brandName: brand.name,
    technologyName: technology?.name,
    capacity,
    capacityUnit,
    kitComponents: kitResolved?.nameLines,
  });

  return prisma.$transaction(async (tx) => {
    if (isKit && kitResolved) {
      await replaceKitComponents(tx, productId, kitResolved.resolved);
    } else if (!isKit && isKitCategory(existing.category.name)) {
      await tx.kitComponent.deleteMany({ where: { kitProductId: productId } });
    }

    return tx.product.update({
      where: { id: productId },
      data: {
        categoryId: category.id,
        brandId: brand.id,
        technologyId: technology?.id ?? null,
        capacity,
        capacityUnit,
        displayName,
        pricingType: resolvePricingType(category.name),
        serialTracking: resolveSerialTracking(category.name),
        hsn: input.hsn,
        gstRate: input.gstRate,
        isActive: input.isActive,
      },
      include: productInclude,
    });
  });
}

export async function addProductPrice(
  prisma: PrismaClient,
  productId: string,
  input: {
    landingCost: number;
    standardPrice: number;
    minimumPrice: number;
    effectiveFrom?: Date;
  },
) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("NOT_FOUND");

  if (input.minimumPrice > input.standardPrice) {
    throw new Error("MINIMUM_ABOVE_STANDARD");
  }

  const effectiveFrom = input.effectiveFrom ?? new Date();

  return prisma.$transaction(async (tx) => {
    const activePrices = await tx.productPrice.findMany({
      where: {
        productId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
    });

    for (const price of activePrices) {
      const closeDate = new Date(effectiveFrom);
      closeDate.setDate(closeDate.getDate() - 1);
      await tx.productPrice.update({
        where: { id: price.id },
        data: { effectiveTo: closeDate },
      });
    }

    return tx.productPrice.create({
      data: {
        productId,
        landingCost: input.landingCost,
        standardPrice: input.standardPrice,
        minimumPrice: input.minimumPrice,
        effectiveFrom,
      },
    });
  });
}

export async function listMasters(prisma: PrismaClient) {
  const [categories, brands, technologies] = await Promise.all([
    prisma.productCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.productTechnology.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    categories: categories.map(serializeMasterRecord),
    brands: brands.map(serializeMasterRecord),
    technologies: technologies.map(serializeMasterRecord),
  };
}

/** Load kit BOM for fulfillment (booking / dispatch). */
export async function getKitComponentsForFulfillment(
  prisma: PrismaClient | Prisma.TransactionClient,
  kitProductId: string,
) {
  const components = await prisma.kitComponent.findMany({
    where: { kitProductId },
    orderBy: { sortOrder: "asc" },
    include: {
      componentProduct: {
        include: { category: true },
      },
    },
  });

  return components.map((component) => ({
    componentProductId: component.componentProductId,
    qty: decimalToNumber(component.qty),
    displayName: component.componentProduct.displayName,
    serialTracking: component.componentProduct.serialTracking,
    categoryName: component.componentProduct.category.name,
  }));
}
