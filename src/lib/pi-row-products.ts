export type PiRowProductItem = {
  id: string;
  qty: number;
  dispatchedQty?: number;
  remainingQty?: number;
  lineTotal?: number;
  product: {
    displayName: string;
    capacityUnit?: string;
  };
};

export const PI_ROW_STACKED_PRODUCT_LIMIT = 3;
export const PI_ROW_INLINE_PRODUCT_LIMIT = 2;

export function formatPiLineQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return String(Math.round(qty * 1000) / 1000);
}

export function formatPiLineQtyUnit(capacityUnit?: string): string {
  return capacityUnit === "METER" ? "Mtr" : "Nos";
}

export function getPiLineDispatch(item: PiRowProductItem): {
  dispatched: number;
  remaining: number;
} {
  const dispatched = item.dispatchedQty ?? 0;
  const remaining = item.remainingQty ?? Math.max(0, item.qty - dispatched);
  return { dispatched, remaining };
}

export function sortPiRowProducts(items: PiRowProductItem[]): PiRowProductItem[] {
  return [...items].sort((a, b) => (b.lineTotal ?? 0) - (a.lineTotal ?? 0));
}

export function getPiRowProductPresentation(items: PiRowProductItem[]): {
  mode: "stacked" | "inline";
  visible: PiRowProductItem[];
  moreCount: number;
} {
  const sorted = sortPiRowProducts(items);
  if (sorted.length <= PI_ROW_STACKED_PRODUCT_LIMIT) {
    return { mode: "stacked", visible: sorted, moreCount: 0 };
  }
  return {
    mode: "inline",
    visible: sorted.slice(0, PI_ROW_INLINE_PRODUCT_LIMIT),
    moreCount: sorted.length - PI_ROW_INLINE_PRODUCT_LIMIT,
  };
}

export function describePiRowProducts(items: PiRowProductItem[]): string {
  if (items.length === 0) return "";
  return sortPiRowProducts(items)
    .map((item) => {
      const unit = formatPiLineQtyUnit(item.product.capacityUnit);
      const { dispatched, remaining } = getPiLineDispatch(item);
      const qty = `${formatPiLineQty(item.qty)} ${unit}`;
      if (dispatched <= 0) return `${item.product.displayName}, ${qty}`;
      if (remaining <= 0) {
        return `${item.product.displayName}, ${qty}, ${formatPiLineQty(dispatched)} dispatched`;
      }
      return `${item.product.displayName}, ${qty}, ${formatPiLineQty(dispatched)} dispatched, ${formatPiLineQty(remaining)} remaining`;
    })
    .join("; ");
}
