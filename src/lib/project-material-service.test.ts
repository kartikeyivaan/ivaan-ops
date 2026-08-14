import { describe, expect, it } from "vitest";
import { ProjectMaterialLineSource, ProjectMaterialLineStatus } from "@prisma/client";
import { lineNeedsApproval } from "@/lib/project-material-service";

describe("lineNeedsApproval", () => {
  it("requires approval for new added lines", () => {
    expect(
      lineNeedsApproval({
        source: ProjectMaterialLineSource.ADDED,
        requiredQty: 5,
        lastApprovedQty: null,
        lineStatus: ProjectMaterialLineStatus.DRAFT,
      }),
    ).toBe(true);
  });

  it("requires approval when qty changed after approval", () => {
    expect(
      lineNeedsApproval({
        source: ProjectMaterialLineSource.PROPOSAL,
        requiredQty: 10,
        lastApprovedQty: 8,
        lineStatus: ProjectMaterialLineStatus.ASSIGNED,
      }),
    ).toBe(true);
  });

  it("skips unchanged approved lines", () => {
    expect(
      lineNeedsApproval({
        source: ProjectMaterialLineSource.PROPOSAL,
        requiredQty: 10,
        lastApprovedQty: 10,
        lineStatus: ProjectMaterialLineStatus.ASSIGNED,
      }),
    ).toBe(false);
  });
});
