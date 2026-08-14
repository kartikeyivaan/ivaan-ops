import { describe, expect, it } from "vitest";
import {
  assertProjectsCompany,
  isIseCompany,
  isProjectsCompany,
} from "@/lib/company-scope";

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
});
