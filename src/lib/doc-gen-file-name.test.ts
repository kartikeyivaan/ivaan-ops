import { describe, expect, it } from "vitest";
import { buildDocGenFileName, customerNameFromSnapshot } from "@/lib/doc-gen-file-name";

describe("doc-gen file names", () => {
  it("builds Customer Name - Template Name", () => {
    expect(buildDocGenFileName("Asha Patil", "Net Metering Form")).toBe(
      "Asha Patil - Net Metering Form",
    );
  });

  it("does not double-prefix an already formatted name", () => {
    expect(buildDocGenFileName("Asha Patil", "Asha Patil - Net Metering Form")).toBe(
      "Asha Patil - Net Metering Form",
    );
  });

  it("reads customer name from snapshot", () => {
    expect(customerNameFromSnapshot({ displayName: "Ravi" })).toBe("Ravi");
    expect(customerNameFromSnapshot({})).toBeNull();
  });
});
