import { describe, expect, it } from "vitest";
import { CapacityUnit, PricingType } from "@prisma/client";
import {
  formatPiEditChangeReasons,
  type PiEditLineSnapshot,
} from "@/lib/pi-edit-approval-reason";
import type { QuotationApprovalProductInfo } from "@/lib/quotation-approval-reason";

const moduleProduct: QuotationApprovalProductInfo = {
  displayName: "Modules - Longi - TOPCon - 580 Wp",
  pricingType: PricingType.WP,
  capacity: 580,
  capacityUnit: CapacityUnit.WP,
  categoryName: "Modules",
  brandName: "Longi",
  technologyName: "TOPCon",
};

const module585: QuotationApprovalProductInfo = {
  ...moduleProduct,
  displayName: "Modules - Longi - TOPCon - 585 Wp",
  capacity: 585,
};

function products(map: Record<string, QuotationApprovalProductInfo>) {
  return new Map(Object.entries(map));
}

describe("formatPiEditChangeReasons", () => {
  it("describes product, rate, and qty changes with short names", () => {
    const current: PiEditLineSnapshot[] = [
      { productId: "a", qty: 18, rate: 24.1 },
    ];
    const proposed: PiEditLineSnapshot[] = [
      { productId: "b", qty: 18, rate: 24.1 },
    ];
    expect(
      formatPiEditChangeReasons(current, proposed, products({ a: moduleProduct, b: module585 })),
    ).toBe("Product change - TOPCon 580Wp to TOPCon 585Wp");

    expect(
      formatPiEditChangeReasons(
        [{ productId: "a", qty: 18, rate: 24.1 }],
        [{ productId: "a", qty: 18, rate: 24.0 }],
        products({ a: moduleProduct }),
      ),
    ).toBe("Rate change - TOPCon 580Wp, 24.10 to 24.00");

    expect(
      formatPiEditChangeReasons(
        [{ productId: "a", qty: 18, rate: 24.1 }],
        [{ productId: "a", qty: 24, rate: 24.1 }],
        products({ a: moduleProduct }),
      ),
    ).toBe("Qty change - TOPCon 580Wp, 18 to 24");
  });

  it("joins multiple changes with semicolons", () => {
    const reason = formatPiEditChangeReasons(
      [
        { productId: "a", qty: 18, rate: 24.1 },
        { productId: "c", qty: 2, rate: 100 },
      ],
      [
        { productId: "a", qty: 24, rate: 24.0 },
        { productId: "c", qty: 2, rate: 100 },
      ],
      products({ a: moduleProduct, c: moduleProduct }),
    );
    expect(reason).toBe(
      "Rate change - TOPCon 580Wp, 24.10 to 24.00; Qty change - TOPCon 580Wp, 18 to 24",
    );
  });
});
