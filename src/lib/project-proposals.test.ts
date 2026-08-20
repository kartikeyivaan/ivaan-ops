import { describe, expect, it } from "vitest";
import {
  canConvertProjectProposalFromStatus,
  canShareProjectProposal,
  isProjectProposalConversionWindowOpen,
} from "@/lib/project-proposals";

describe("project proposal sharing", () => {
  it("allows download and share only for approved lifecycle statuses", () => {
    expect(canShareProjectProposal("APPROVED")).toBe(true);
    expect(canShareProjectProposal("SENT")).toBe(true);
    expect(canShareProjectProposal("EXPIRED")).toBe(true);
    expect(canShareProjectProposal("CONVERTED")).toBe(true);
  });

  it("blocks draft and pending approval proposals from sharing", () => {
    expect(canShareProjectProposal("DRAFT")).toBe(false);
    expect(canShareProjectProposal("PENDING_APPROVAL")).toBe(false);
    expect(canShareProjectProposal("REJECTED")).toBe(false);
  });
});

describe("project proposal conversion window", () => {
  it("allows conversion for approved and expired proposals within 45 days", () => {
    expect(canConvertProjectProposalFromStatus("APPROVED")).toBe(true);
    expect(canConvertProjectProposalFromStatus("EXPIRED")).toBe(true);

    expect(
      isProjectProposalConversionWindowOpen("2026-01-01", new Date("2026-02-15T10:00:00.000Z")),
    ).toBe(true);
  });

  it("blocks conversion after 45 days from proposal date", () => {
    expect(
      isProjectProposalConversionWindowOpen("2026-01-01", new Date("2026-02-16T10:00:00.000Z")),
    ).toBe(false);
  });
});
