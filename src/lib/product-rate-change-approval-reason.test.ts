import { describe, expect, it } from "vitest";
import { PricingType } from "@prisma/client";
import {
  formatProductRateChangeLineReason,
  joinProductRateChangeReasons,
} from "@/lib/product-rate-change-approval-reason";

describe("product rate change approval reason", () => {
  it("formats line and joins with sign-off suffix", () => {
    expect(
      formatProductRateChangeLineReason({
        shortName: "TOPCon 580Wp",
        pricingType: PricingType.WP,
        previousStandardPrice: 25,
        newStandardPrice: 26,
        previousMinimumPrice: 24.1,
        newMinimumPrice: 24.5,
      }),
    ).toBe("TOPCon 580Wp - Std 25.00 to 26.00, Min 24.10 to 24.50");

    expect(
      joinProductRateChangeReasons(
        ["TOPCon 580Wp - Std 25.00 to 26.00, Min 24.10 to 24.50"],
        "Sign-off 1/2",
      ),
    ).toBe("TOPCon 580Wp - Std 25.00 to 26.00, Min 24.10 to 24.50; Sign-off 1/2");
  });
});
