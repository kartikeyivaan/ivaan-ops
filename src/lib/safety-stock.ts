export const DEFAULT_SAFETY_STOCK = 0;

export function resolveSafetyQty(override: number | null | undefined): number {
  if (override == null) {
    return DEFAULT_SAFETY_STOCK;
  }

  if (!Number.isFinite(override) || override < 0) {
    throw new RangeError("Safety stock must be a finite non-negative number.");
  }

  return override;
}
