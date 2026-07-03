import { describe, expect, it } from "vitest";
import { ProjectProposalStatus } from "@prisma/client";
import { ROLES } from "@/lib/rbac";
import {
  canAccessProjectProposal,
  canEditProjectProposal,
  restrictProjectProposalSalesUserId,
} from "@/lib/project-proposal-permissions";

describe("project proposal permissions", () => {
  it("allows managers to access any proposal", () => {
    expect(
      canAccessProjectProposal([ROLES.PROJECTS_MANAGER], "exec-1", "exec-2"),
    ).toBe(true);
  });

  it("restricts projects sales executives to own proposals", () => {
    expect(
      canAccessProjectProposal(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        "exec-1",
      ),
    ).toBe(true);
    expect(
      canAccessProjectProposal(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        "exec-2",
      ),
    ).toBe(false);
  });

  it("blocks sales executive edits while pending approval", () => {
    expect(
      canEditProjectProposal(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        {
          salesUserId: "exec-1",
          status: ProjectProposalStatus.PENDING_APPROVAL,
        },
      ),
    ).toBe(false);
  });

  it("forces sales executive list scope to self", () => {
    expect(
      restrictProjectProposalSalesUserId(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        "exec-2",
      ),
    ).toBe("exec-1");
    expect(
      restrictProjectProposalSalesUserId(
        [ROLES.PROJECTS_MANAGER],
        "exec-1",
        "exec-2",
      ),
    ).toBe("exec-2");
  });
});
