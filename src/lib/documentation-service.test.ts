import { describe, expect, it } from "vitest";
import { DocumentationStatus } from "@prisma/client";
import {
  calculateDocumentationAgeing,
  validateDocumentationStatusInput,
} from "@/lib/documentation-service";

describe("documentation status rules", () => {
  it("requires a reason when putting a record on hold", () => {
    expect(() => validateDocumentationStatusInput(DocumentationStatus.HOLD, {}))
      .toThrow("HOLD_REASON_REQUIRED");
  });

  it("requires a reason when sending a record for review", () => {
    expect(() => validateDocumentationStatusInput(DocumentationStatus.FOR_REVIEW, {}))
      .toThrow("REVIEW_REASON_REQUIRED");
  });

  it("accepts terminal statuses without reasons", () => {
    expect(() => validateDocumentationStatusInput(DocumentationStatus.DCR_ISSUED, {}))
      .not.toThrow();
  });
});

describe("documentation ageing", () => {
  it("counts complete elapsed calendar days", () => {
    expect(calculateDocumentationAgeing(
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-11T23:59:59.000Z"),
    )).toBe(10);
  });

  it("never returns negative ageing", () => {
    expect(calculateDocumentationAgeing(
      new Date("2026-07-11T00:00:00.000Z"),
      new Date("2026-07-01T00:00:00.000Z"),
    )).toBe(0);
  });
});
