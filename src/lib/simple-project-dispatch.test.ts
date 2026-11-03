import { describe, expect, it } from "vitest";
import { SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD } from "@/lib/simple-project-dispatch";
import {
  canCancelSimpleProjectDispatch,
  canConfirmSimpleProjectDispatch,
  canCreateMinimalProject,
  canPrepareSimpleProjectDispatch,
} from "@/lib/project-permissions";
import { ROLES } from "@/lib/rbac";

describe("Simple Project Dispatch thresholds & RBAC", () => {
  it("uses total serial count threshold of 10", () => {
    expect(SIMPLE_PROJECT_DISPATCH_LARGE_THRESHOLD).toBe(10);
  });

  it("allows warehouse to prepare but not confirm or cancel", () => {
    const roles = [ROLES.WAREHOUSE];
    expect(canPrepareSimpleProjectDispatch(roles)).toBe(true);
    expect(canCreateMinimalProject(roles)).toBe(true);
    expect(canConfirmSimpleProjectDispatch(roles)).toBe(false);
    expect(canCancelSimpleProjectDispatch(roles)).toBe(false);
  });

  it("allows projects manager to prepare, confirm, and cancel", () => {
    const roles = [ROLES.PROJECTS_MANAGER];
    expect(canPrepareSimpleProjectDispatch(roles)).toBe(true);
    expect(canConfirmSimpleProjectDispatch(roles)).toBe(true);
    expect(canCancelSimpleProjectDispatch(roles)).toBe(true);
  });

  it("allows super admin full access", () => {
    const roles = [ROLES.SUPER_ADMIN];
    expect(canPrepareSimpleProjectDispatch(roles)).toBe(true);
    expect(canConfirmSimpleProjectDispatch(roles)).toBe(true);
    expect(canCancelSimpleProjectDispatch(roles)).toBe(true);
  });
});
