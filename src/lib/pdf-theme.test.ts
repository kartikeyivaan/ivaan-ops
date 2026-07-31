import { describe, expect, it } from "vitest";

import { DEFAULT_TERMS, buildDocumentTerms } from "@/lib/pdf-theme";

describe("buildDocumentTerms", () => {
  it("prepends the delivery term note and drops the generic payment default", () => {
    expect(
      buildDocumentTerms(
        null,
        "30% advance payment is required for booking. Delivery is expected within 5–7 days from booking confirmation.",
      ),
    ).toEqual([
      "30% advance payment is required for booking. Delivery is expected within 5–7 days from booking confirmation.",
      ...DEFAULT_TERMS.filter((term) => !term.startsWith("Payment:")),
    ]);
  });

  it("keeps company terms and still prepends the delivery note", () => {
    expect(
      buildDocumentTerms(
        "Warranty as per OEM.\nFreight extra.",
        "Dispatch is subject to material availability.",
      ),
    ).toEqual([
      "Dispatch is subject to material availability.",
      "Warranty as per OEM.",
      "Freight extra.",
    ]);
  });

  it("returns fallback terms when no delivery note is set", () => {
    expect(buildDocumentTerms(null, null)).toEqual([...DEFAULT_TERMS]);
  });
});
