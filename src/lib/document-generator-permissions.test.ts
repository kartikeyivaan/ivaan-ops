import { describe, expect, it } from "vitest";
import {
  canAdminDocumentGenerator,
  canGenerateDocuments,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import { ROLES } from "@/lib/rbac";

describe("document generator permissions", () => {
  it("allows documentation and accounts to view and generate", () => {
    expect(canViewDocumentGenerator([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(true);
    expect(canGenerateDocuments([ROLES.ACCOUNTS])).toBe(true);
  });

  it("restricts admin actions to super admin", () => {
    expect(canAdminDocumentGenerator([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canAdminDocumentGenerator([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(false);
  });
});
