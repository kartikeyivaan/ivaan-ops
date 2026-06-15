import { CapacityUnit, PricingType } from "@prisma/client";

export const PRODUCT_CATEGORY_NAMES = ["Modules", "Inverters", "Other"] as const;

export const CAPACITY_UNITS = [
  { value: CapacityUnit.WP, label: "Wp" },
  { value: CapacityUnit.KW, label: "kW" },
  { value: CapacityUnit.KVA, label: "kVA" },
  { value: CapacityUnit.NOS, label: "Nos" },
  { value: CapacityUnit.METER, label: "Meter" },
] as const;

export function resolvePricingType(categoryName: string): PricingType {
  return categoryName === "Modules" ? PricingType.WP : PricingType.UNIT;
}

export function resolveSerialTracking(categoryName: string): boolean {
  return categoryName === "Modules" || categoryName === "Inverters";
}

export function formatCapacityUnit(unit: CapacityUnit): string {
  return CAPACITY_UNITS.find((item) => item.value === unit)?.label ?? unit;
}

export function generateDisplayName(input: {
  categoryName: string;
  brandName: string;
  technologyName?: string | null;
  capacity: number | string;
  capacityUnit: CapacityUnit;
}): string {
  const parts = [
    input.categoryName,
    input.brandName,
    input.technologyName || null,
    `${input.capacity} ${formatCapacityUnit(input.capacityUnit)}`,
  ].filter(Boolean);
  return parts.join(" - ");
}

export function getStockPlaceholder() {
  return {
    availableStock: 0,
    incomingStock: 0,
    bookedStock: 0,
  };
}

export function formatPricingType(pricingType: PricingType): string {
  return pricingType === PricingType.WP ? "WP" : "Unit";
}
