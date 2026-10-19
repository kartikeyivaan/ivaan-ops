import { describe, expect, it } from "vitest";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  mapDocGenCompanySessionError,
} from "@/lib/company-scope";
import {
  DOC_GEN_AUDIT_EVENTS,
  DOC_GEN_AUDIT_REASONS,
  DOC_GEN_AUDIT_TABLES,
} from "@/lib/doc-gen-audit";
import {
  canAdminDocumentGenerator,
  canGenerateDocuments,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import { ROLES } from "@/lib/rbac";

describe("document generator security (Phase 4)", () => {
  it("blocks sales from view, generate, and admin", () => {
    const roles = [ROLES.SALES_EXECUTIVE];
    expect(canViewDocumentGenerator(roles)).toBe(false);
    expect(canGenerateDocuments(roles)).toBe(false);
    expect(canAdminDocumentGenerator(roles)).toBe(false);
  });

  it("allows documentation generate but not template/set admin", () => {
    const roles = [ROLES.DOCUMENTATION_EXECUTIVE];
    expect(canGenerateDocuments(roles)).toBe(true);
    expect(canAdminDocumentGenerator(roles)).toBe(false);
  });

  it("allows accounts generate but not admin", () => {
    const roles = [ROLES.ACCOUNTS];
    expect(canGenerateDocuments(roles)).toBe(true);
    expect(canAdminDocumentGenerator(roles)).toBe(false);
  });

  it("allows super admin full access", () => {
    const roles = [ROLES.SUPER_ADMIN];
    expect(canViewDocumentGenerator(roles)).toBe(true);
    expect(canGenerateDocuments(roles)).toBe(true);
    expect(canAdminDocumentGenerator(roles)).toBe(true);
  });

  it("enforces ISE-only company gate", () => {
    expect(() => assertDocGenCompany({ code: "PCMV", name: "PCMV" })).toThrow("DOC_GEN_ISE_ONLY");
    expect(() => assertDocGenCompany({ code: "ISE", name: "Ivaan Solar Energy" })).not.toThrow();

    const mapped = mapDocGenCompanySessionError(new Error("DOC_GEN_ISE_ONLY"));
    expect(mapped?.status).toBe(403);
    expect(mapped?.message).toBe(DOC_GEN_ISE_ONLY_MESSAGE);
  });

  it("exposes stable audit table/event catalog for admin audit filters", () => {
    expect(DOC_GEN_AUDIT_TABLES.generations).toBe("doc_gen_generations");
    expect(DOC_GEN_AUDIT_TABLES.templateVersions).toBe("doc_gen_template_versions");
    expect(DOC_GEN_AUDIT_TABLES.setVersions).toBe("doc_gen_document_set_versions");
    expect(DOC_GEN_AUDIT_REASONS[DOC_GEN_AUDIT_EVENTS.GENERATION_CREATED]).toMatch(/generated/i);
    expect(DOC_GEN_AUDIT_REASONS[DOC_GEN_AUDIT_EVENTS.SET_PUBLISHED]).toMatch(/set/i);
  });
});
