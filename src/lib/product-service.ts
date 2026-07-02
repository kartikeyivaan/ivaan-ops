import {
  CapacityUnit,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  generateDisplayName,
  resolvePricingType,
  resolveSerialTracking,
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

function serializeProductRecord(
  product: ProductRecord,
  stock: StockSummary,
) {
  const currentPrice = getCurrentPrice(product.prices);

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
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    category: serializeMasterRecord(product.category),
    brand: serializeMasterRecord(product.brand),
    technology: product.technology
      ? serializeMasterRecord(product.technology)
      : null,
    prices: product.prices.map(serializeProductPrice),
    currentPrice: currentPrice ? serializeProductPrice(currentPrice) : null,
    stock,
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
  return serializeProductRecord(
    product,
    stock ?? (await getProductStockSummary(prisma, companyId, product.id)),
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

async function upsertBrand(prisma: PrismaClient, name: string) {
  return prisma.brand.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function upsertTechnology(prisma: PrismaClient, name?: string | null) {
  if (!name?.trim()) return null;
  return prisma.productTechnology.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

export async function createProduct(
  prisma: PrismaClient,
  input: {
    categoryId: string;
    brandName: string;
    technologyName?: string | null;
    capacity: number;
    capacityUnit: CapacityUnit;
    hsn?: string;
    gstRate: number;
    isActive?: boolean;
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

  const brand = await upsertBrand(prisma, input.brandName.trim());
  const technology = await upsertTechnology(prisma, input.technologyName);

  const displayName = generateDisplayName({
    categoryName: category.name,
    brandName: brand.name,
    technologyName: technology?.name,
    capacity: input.capacity,
    capacityUnit: input.capacityUnit,
  });

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        categoryId: category.id,
        brandId: brand.id,
        technologyId: technology?.id ?? null,
        capacity: input.capacity,
        capacityUnit: input.capacityUnit,
        displayName,
        pricingType: resolvePricingType(category.name),
        hsn: input.hsn,
        gstRate: input.gstRate,
        serialTracking: resolveSerialTracking(category.name),
        isActive: input.isActive ?? true,
      },
      include: productInclude,
    });

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
  },
) {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, brand: true, technology: true },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const category = input.categoryId
    ? await prisma.productCategory.findUnique({ where: { id: input.categoryId } })
    : existing.category;
  if (!category) throw new Error("CATEGORY_NOT_FOUND");

  const brand = input.brandName
    ? await upsertBrand(prisma, input.brandName.trim())
    : existing.brand;

  const technology =
    input.technologyName !== undefined
      ? await upsertTechnology(prisma, input.technologyName)
      : existing.technology;

  const capacity = input.capacity ?? Number(existing.capacity);
  const capacityUnit = input.capacityUnit ?? existing.capacityUnit;

  const displayName = generateDisplayName({
    categoryName: category.name,
    brandName: brand.name,
    technologyName: technology?.name,
    capacity,
    capacityUnit,
  });

  return prisma.product.update({
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
