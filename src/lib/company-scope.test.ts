import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import {
  ALL_COMPANIES_ID,
  assertProjectsCompany,
  isIseCompany,
  isProjectsCompany,
  requireAccessibleCompany,
} from "@/lib/company-scope";

function sessionWithCompanies(
  activeCompanyId: string,
  companies: Array<{ id: string; name: string; code: string; isPractice?: boolean }>,
): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: "user-1",
      name: "Accounts",
      email: "accounts@example.com",
      roles: ["Accounts"],
      companies,
      activeCompanyId,
      passwordChangeRequired: false,
      passwordChangeReason: null,
    },
  };
}

describe("company scope", () => {
  it("recognises Ivaan Solar Energy as the projects company", () => {
    expect(isIseCompany({ code: "ISE", name: "Ivaan Solar Energy" })).toBe(true);
    expect(isProjectsCompany({ code: "ISE" })).toBe(true);
  });

  it("allows the Practice sandbox for projects", () => {
    expect(isProjectsCompany({ code: "LEARN", isPractice: true })).toBe(true);
  });

  it("rejects PCM Ventures for projects", () => {
    expect(isProjectsCompany({ code: "PCMV", name: "PCM Ventures" })).toBe(false);
    expect(() => assertProjectsCompany({ code: "PCMV" })).toThrow("PROJECTS_ISE_ONLY");
  });

  it("approves a record from either firm when All companies is selected", () => {
    const session = sessionWithCompanies(ALL_COMPANIES_ID, [
      { id: "pcmv", name: "PCM Ventures", code: "PCMV" },
      { id: "ise", name: "Ivaan Solar Energy", code: "ISE" },
    ]);
    expect(requireAccessibleCompany(session, "ise")).toBe("ise");
    expect(requireAccessibleCompany(session, "pcmv")).toBe("pcmv");
  });

  it("rejects a record from another firm when a single company is selected", () => {
    const session = sessionWithCompanies("pcmv", [
      { id: "pcmv", name: "PCM Ventures", code: "PCMV" },
      { id: "ise", name: "Ivaan Solar Energy", code: "ISE" },
    ]);
    expect(requireAccessibleCompany(session, "pcmv")).toBe("pcmv");
    expect(() => requireAccessibleCompany(session, "ise")).toThrow("NOT_FOUND");
  });
});
