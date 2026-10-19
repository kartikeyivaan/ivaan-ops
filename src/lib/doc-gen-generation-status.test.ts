import { describe, expect, it } from "vitest";
import { DocGenGenerationStatus } from "@prisma/client";
import { resolveDocGenGenerationStatus } from "@/lib/doc-gen-generation-service";

describe("resolveDocGenGenerationStatus", () => {
  it("returns PARTIAL when combined PDF fails but documents succeeded", () => {
    expect(
      resolveDocGenGenerationStatus({
        anyDocumentFailed: false,
        successfulDocumentCount: 2,
        combinedError: "Combined PDF could not be created",
      }),
    ).toBe(DocGenGenerationStatus.PARTIAL);
  });

  it("returns PARTIAL when some documents fail", () => {
    expect(
      resolveDocGenGenerationStatus({
        anyDocumentFailed: true,
        successfulDocumentCount: 1,
        combinedError: null,
      }),
    ).toBe(DocGenGenerationStatus.PARTIAL);
  });

  it("returns FAILED when every document fails", () => {
    expect(
      resolveDocGenGenerationStatus({
        anyDocumentFailed: true,
        successfulDocumentCount: 0,
        combinedError: null,
      }),
    ).toBe(DocGenGenerationStatus.FAILED);
  });

  it("returns COMPLETED when all documents and combined PDF succeed", () => {
    expect(
      resolveDocGenGenerationStatus({
        anyDocumentFailed: false,
        successfulDocumentCount: 3,
        combinedError: null,
      }),
    ).toBe(DocGenGenerationStatus.COMPLETED);
  });
});
