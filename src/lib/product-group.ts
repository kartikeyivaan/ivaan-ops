/**
 * Interchange groups for products (e.g. TOPCon DCR 570/575/580/585/590).
 *
 * Products in the same group can be swapped on a PI without approval.
 * A product with no group is its own group, so any change away from it needs approval.
 */

export function normalizeProductGroup(value: string | null | undefined): string | null {
  const collapsed = value?.trim().replace(/\s+/g, " ").toLowerCase();
  return collapsed ? collapsed : null;
}

/** Key used to compare products: same group → same key; no group → unique per product. */
export function productGroupKey(productId: string, group: string | null | undefined): string {
  const normalized = normalizeProductGroup(group);
  return normalized ? `group:${normalized}` : `product:${productId}`;
}

export type PiLineForGroupCheck = {
  productId: string;
  qty: number;
  rate: number;
};

/**
 * True when the only difference between current and proposed PI lines is swapping a
 * product for another product in the same group, with qty and rate unchanged.
 *
 * Lines are compared as buckets of (qty, rate); within a bucket the multiset of
 * group keys must match. Any line-count change, qty/rate change, or cross-group swap
 * returns false.
 */
export function isSameGroupProductSwapOnly(
  current: PiLineForGroupCheck[],
  proposed: PiLineForGroupCheck[],
  groupByProductId: Map<string, string | null | undefined>,
): boolean {
  if (current.length !== proposed.length) return false;

  const bucketKey = (line: PiLineForGroupCheck) => `${line.qty}|${line.rate}`;
  const toBuckets = (lines: PiLineForGroupCheck[]) => {
    const buckets = new Map<string, string[]>();
    for (const line of lines) {
      const key = bucketKey(line);
      const keys = buckets.get(key) ?? [];
      keys.push(
        productGroupKey(line.productId, groupByProductId.get(line.productId)),
      );
      buckets.set(key, keys);
    }
    return buckets;
  };

  const currentBuckets = toBuckets(current);
  const proposedBuckets = toBuckets(proposed);
  if (currentBuckets.size !== proposedBuckets.size) return false;

  for (const [key, currentKeys] of currentBuckets) {
    const proposedKeys = proposedBuckets.get(key);
    if (!proposedKeys || proposedKeys.length !== currentKeys.length) return false;
    const a = [...currentKeys].sort();
    const b = [...proposedKeys].sort();
    if (a.some((value, index) => value !== b[index])) return false;
  }
  return true;
}
