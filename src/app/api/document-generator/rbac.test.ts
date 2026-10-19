import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/rbac";
import {
  canAdminDocumentGenerator,
  canGenerateDocuments,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";

describe("document generator API RBAC matrix", () => {
  it("allows generate routes for documentation and accounts but not template admin", () => {
    expect(canGenerateDocuments([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(true);
    expect(canGenerateDocuments([ROLES.ACCOUNTS])).toBe(true);
    expect(canAdminDocumentGenerator([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(false);
    expect(canAdminDocumentGenerator([ROLES.ACCOUNTS])).toBe(false);
  });

  it("allows set admin only for super admin while keeping view access broader", () => {
    expect(canAdminDocumentGenerator([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canViewDocumentGenerator([ROLES.DOCUMENTATION_EXECUTIVE])).toBe(true);
    expect(canViewDocumentGenerator([ROLES.SALES_EXECUTIVE])).toBe(false);
  });
});
