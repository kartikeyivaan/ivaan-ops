import { describe, expect, it } from "vitest";
import { totalProposedPanelCount } from "@/lib/proposal-bom";

describe("project material BOM helpers", () => {
  it("computes total panel count from revision fields", () => {
    expect(
      totalProposedPanelCount({
        panelCount: 6,
        dcrAdditionalPanels: 2,
        ndcrAdditionalPanels: 1,
        futureStructurePanels: 0,
      }),
    ).toBe(9);
  });
});
