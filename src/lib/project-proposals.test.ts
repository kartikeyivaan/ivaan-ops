import { describe, expect, it } from "vitest";
import { canShareProjectProposal } from "@/lib/project-proposals";

describe("project proposal sharing", () => {
  it("allows download and share only for approved lifecycle statuses", () => {
    expect(canShareProjectProposal("APPROVED")).toBe(true);
    expect(canShareProjectProposal("SENT")).toBe(true);
    expect(canShareProjectProposal("CONVERTED")).toBe(true);
  });

  it("blocks draft and pending approval proposals from sharing", () => {
    expect(canShareProjectProposal("DRAFT")).toBe(false);
    expect(canShareProjectProposal("PENDING_APPROVAL")).toBe(false);
    expect(canShareProjectProposal("REJECTED")).toBe(false);
  });
});
