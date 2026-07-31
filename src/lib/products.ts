import { CapacityUnit, PricingType } from "@prisma/client";

export const PRODUCT_CATEGORY_NAMES = [
  "Modules",
  "Inverters",
  "Other",
  "Kit",
] as const;

export const KIT_CATEGORY_NAME = "Kit";
export const KIT_DEFAULT_BRAND = "Ivaan";

export const CAPACITY_UNITS = [
  { value: CapacityUnit.WP, label: "Wp" },
  { value: CapacityUnit.KW, label: "kW" },
  { value: CapacityUnit.KVA, label: "kVA" },
  { value: CapacityUnit.NOS, label: "Nos" },
  { value: CapacityUnit.METER, label: "Meter" },
] as const;

export function isKitCategory(categoryName: string): boolean {
  return categoryName === KIT_CATEGORY_NAME;
}

export function resolvePricingType(categoryName: string): PricingType {
  return categoryName === "Modules" ? PricingType.WP : PricingType.UNIT;
}

export function resolveSerialTracking(categoryName: string): boolean {
  if (isKitCategory(categoryName)) return false;
  return categoryName === "Modules" || categoryName === "Inverters";
}

export function formatCapacityUnit(unit: CapacityUnit): string {
  return CAPACITY_UNITS.find((item) => item.value === unit)?.label ?? unit;
}

export type KitBomLineForName = {
  categoryName: string;
  brandName: string;
  capacity: number;
  capacityUnit: CapacityUnit;
  qty: number;
};

function formatCompactCapacity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

/** System DC kWp from module lines in a kit BOM. */
export function calculateKitSystemKwp(lines: KitBomLineForName[]): number {
  const totalWp = lines
    .filter((line) => line.categoryName === "Modules")
    .reduce((sum, line) => {
      const wp =
        line.capacityUnit === CapacityUnit.WP
          ? line.capacity
          : line.capacityUnit === CapacityUnit.KW
            ? line.capacity * 1000
            : 0;
      return sum + wp * line.qty;
    }, 0);
  return Math.round((totalWp / 1000) * 1000) / 1000;
}

export function generateKitDisplayName(lines: KitBomLineForName[]): string {
  const modules = lines.filter((line) => line.categoryName === "Modules");
  const inverters = lines.filter((line) => line.categoryName === "Inverters");
  const primaryModule = modules.sort((a, b) => b.qty - a.qty)[0];
  const primaryInverter = inverters.sort((a, b) => b.qty - a.qty)[0];
  const systemKwp = calculateKitSystemKwp(lines);

  const parts = [`Kit - ${formatCompactCapacity(systemKwp)} kWp`];

  if (primaryModule) {
    const panelWp =
      primaryModule.capacityUnit === CapacityUnit.WP
        ? primaryModule.capacity
        : primaryModule.capacityUnit === CapacityUnit.KW
          ? primaryModule.capacity * 1000
          : primaryModule.capacity;
    parts.push(
      `${primaryModule.brandName} ${formatCompactCapacity(panelWp)}Wp ×${formatCompactCapacity(primaryModule.qty)}`,
    );
  }

  if (primaryInverter) {
    const invKw =
      primaryInverter.capacityUnit === CapacityUnit.KW ||
      primaryInverter.capacityUnit === CapacityUnit.KVA
        ? primaryInverter.capacity
        : primaryInverter.capacityUnit === CapacityUnit.WP
          ? primaryInverter.capacity / 1000
          : primaryInverter.capacity;
    parts.push(
      `${primaryInverter.brandName} ${formatCompactCapacity(invKw)}kW`,
    );
  }

  return parts.join(" - ");
}

export function generateDisplayName(input: {
  categoryName: string;
  brandName: string;
  technologyName?: string | null;
  capacity: number | string;
  capacityUnit: CapacityUnit;
  kitComponents?: KitBomLineForName[];
}): string {
  if (isKitCategory(input.categoryName)) {
    return generateKitDisplayName(input.kitComponents ?? []);
  }

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
    damagedStock: 0,
  };
}

export function formatPricingType(pricingType: PricingType): string {
  return pricingType === PricingType.WP ? "WP" : "Unit";
}

/** Expand kit qty into component fulfillment quantities. */
export function explodeKitQty(
  kitQty: number,
  components: Array<{ componentProductId: string; qty: number }>,
): Array<{ productId: string; qty: number }> {
  return components.map((component) => ({
    productId: component.componentProductId,
    qty: kitQty * component.qty,
  }));
}
