import { describe, expect, it, vi } from "vitest";
import { ProjectEnquiryStatus, type PrismaClient } from "@prisma/client";
import { ROLES } from "@/lib/rbac";
import {
  canAccessProjectEnquiry,
  restrictProjectEnquirySalesUserId,
} from "@/lib/project-enquiry-permissions";
import {
  attachProposalToEnquiry,
  markProjectEnquiryWon,
} from "@/lib/project-enquiry-service";
import {
  createProjectEnquiryFollowupSchema,
  createProjectEnquirySchema,
  markProjectEnquiryLostSchema,
} from "@/lib/validations";

describe("project enquiry permissions", () => {
  it("limits projects sales executive to own enquiries", () => {
    expect(
      canAccessProjectEnquiry([ROLES.PROJECTS_SALES_EXECUTIVE], "exec-1", "exec-1"),
    ).toBe(true);
    expect(
      canAccessProjectEnquiry([ROLES.PROJECTS_SALES_EXECUTIVE], "exec-1", "exec-2"),
    ).toBe(false);
    expect(
      restrictProjectEnquirySalesUserId(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        "exec-2",
      ),
    ).toBe("exec-1");
  });

  it("allows projects manager to view all enquiries", () => {
    expect(canAccessProjectEnquiry([ROLES.PROJECTS_MANAGER], "mgr-1", "exec-2")).toBe(true);
    expect(
      restrictProjectEnquirySalesUserId([ROLES.PROJECTS_MANAGER], "mgr-1", "exec-2"),
    ).toBe("exec-2");
  });
});

describe("project enquiry validations", () => {
  it("accepts valid minimal enquiry payload", () => {
    const result = createProjectEnquirySchema.safeParse({
      customerName: "Sachin Joshi",
      customerMobile: "9423938797",
      nextFollowupAt: "2026-08-13",
    });
    expect(result.success).toBe(true);
  });

  it("requires followup note and date", () => {
    expect(createProjectEnquiryFollowupSchema.safeParse({}).success).toBe(false);
    expect(
      createProjectEnquiryFollowupSchema.safeParse({
        note: "Called customer",
        followupDate: "2026-08-12",
        nextFollowupAt: "2026-08-14",
      }).success,
    ).toBe(true);
  });

  it("requires lost reason", () => {
    expect(markProjectEnquiryLostSchema.safeParse({ lostReason: "" }).success).toBe(false);
    expect(
      markProjectEnquiryLostSchema.safeParse({ lostReason: "Budget deferred by customer" }).success,
    ).toBe(true);
  });
});

describe("project enquiry service transitions", () => {
  it("prevents winning enquiry before proposal is linked", async () => {
    const prisma = {
      projectEnquiry: {
        findFirst: vi.fn().mockResolvedValue({
          id: "enq-1",
          companyId: "company-1",
          salesUserId: "exec-1",
          status: ProjectEnquiryStatus.OPEN,
          proposalId: null,
          nextFollowupAt: new Date("2026-08-12"),
          lastFollowupAt: null,
          createdAt: new Date("2026-08-10"),
          updatedAt: new Date("2026-08-10"),
          customerName: "Customer",
          customerMobile: "9999999999",
          enquiryNo: "ENQ-1",
          lostReason: null,
          company: { id: "company-1", code: "CMP", name: "Demo" },
          salesUser: { id: "exec-1", name: "Exec", email: "e@a.com", mobile: null },
          createdBy: { id: "exec-1", name: "Exec", email: "e@a.com" },
          updatedBy: { id: "exec-1", name: "Exec", email: "e@a.com" },
          proposal: null,
          followups: [],
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      markProjectEnquiryWon(prisma, {
        enquiryId: "enq-1",
        companyId: "company-1",
        userId: "exec-1",
        userRoles: [ROLES.PROJECTS_SALES_EXECUTIVE],
      }),
    ).rejects.toThrow("PROPOSAL_REQUIRED");
  });

  it("enforces single proposal link per enquiry", async () => {
    const prisma = {
      projectEnquiry: {
        findFirst: vi.fn().mockResolvedValue({
          id: "enq-1",
          companyId: "company-1",
          salesUserId: "exec-1",
          status: ProjectEnquiryStatus.PROPOSAL_SENT,
          proposalId: "proposal-1",
          nextFollowupAt: new Date("2026-08-12"),
          lastFollowupAt: null,
          createdAt: new Date("2026-08-10"),
          updatedAt: new Date("2026-08-10"),
          customerName: "Customer",
          customerMobile: "9999999999",
          enquiryNo: "ENQ-1",
          lostReason: null,
          company: { id: "company-1", code: "CMP", name: "Demo" },
          salesUser: { id: "exec-1", name: "Exec", email: "e@a.com", mobile: null },
          createdBy: { id: "exec-1", name: "Exec", email: "e@a.com" },
          updatedBy: { id: "exec-1", name: "Exec", email: "e@a.com" },
          proposal: { id: "proposal-1", proposalNo: "P1", status: "APPROVED" },
          followups: [],
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      attachProposalToEnquiry(prisma, {
        enquiryId: "enq-1",
        companyId: "company-1",
        proposalId: "proposal-2",
        userId: "exec-1",
      }),
    ).rejects.toThrow("ENQUIRY_ALREADY_HAS_PROPOSAL");
  });
});
