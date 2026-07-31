import type { DamageCategory } from "@prisma/client";

export const DAMAGE_CATEGORY_LABELS: Record<DamageCategory, string> = {
  HANDLING: "Handling",
  STORAGE: "Storage",
  TRANSIT_AFTER_INWARD: "Transit after inward",
  OTHER: "Other",
};

export const DAMAGE_CATEGORIES = Object.keys(
  DAMAGE_CATEGORY_LABELS,
) as DamageCategory[];
