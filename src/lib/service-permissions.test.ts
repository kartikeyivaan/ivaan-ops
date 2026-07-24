import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/rbac";
import {
  canAddServiceUpdate,
  canAssignService,
  canCloseService,
  canCompleteService,
  canCreateService,
  canEditService,
  canExportService,
  canManageServiceWorkTypes,
  canRecordServicePayment,
  canReopenService,
  canUpdateServiceStatus,
  canViewAllService,
  canViewService,
  isServiceExecutive,
  restrictServiceToAssigned,
} from "@/lib/service-permissions";

const SUPER = [ROLES.SUPER_ADMIN];
const MANAGER = [ROLES.PROJECTS_MANAGER];
const PROJECTS_SALES = [ROLES.PROJECTS_SALES_EXECUTIVE];
const EXEC = [ROLES.SERVICE_EXECUTIVE];
const OUTSIDER = [ROLES.WAREHOUSE];

describe("service-permissions", () => {
  it("grants full access to super admin and projects manager", () => {
    for (const roles of [SUPER, MANAGER]) {
      expect(canViewService(roles)).toBe(true);
      expect(canViewAllService(roles)).toBe(true);
      expect(canCreateService(roles)).toBe(true);
      expect(canEditService(roles)).toBe(true);
      expect(canAssignService(roles)).toBe(true);
      expect(canUpdateServiceStatus(roles)).toBe(true);
      expect(canAddServiceUpdate(roles)).toBe(true);
      expect(canCompleteService(roles)).toBe(true);
      expect(canCloseService(roles)).toBe(true);
      expect(canReopenService(roles)).toBe(true);
      expect(canRecordServicePayment(roles)).toBe(true);
      expect(canManageServiceWorkTypes(roles)).toBe(true);
      expect(canExportService(roles)).toBe(true);
    }
  });

  it("limits the service executive to operational actions on assigned work", () => {
    expect(isServiceExecutive(EXEC)).toBe(true);
    expect(canViewService(EXEC)).toBe(true);
    expect(canCreateService(EXEC)).toBe(true);
    expect(canEditService(EXEC)).toBe(true);
    expect(canUpdateServiceStatus(EXEC)).toBe(true);
    expect(canAddServiceUpdate(EXEC)).toBe(true);
    expect(canCompleteService(EXEC)).toBe(true);
    expect(canRecordServicePayment(EXEC)).toBe(true);

    // Not permitted for executives.
    expect(canViewAllService(EXEC)).toBe(false);
    expect(canAssignService(EXEC)).toBe(false);
    expect(canCloseService(EXEC)).toBe(false);
    expect(canReopenService(EXEC)).toBe(false);
    expect(canManageServiceWorkTypes(EXEC)).toBe(false);
    expect(canExportService(EXEC)).toBe(false);

    // Executives only see their own assigned requests.
    expect(restrictServiceToAssigned(EXEC)).toBe(true);
    expect(restrictServiceToAssigned(SUPER)).toBe(false);
    expect(restrictServiceToAssigned(MANAGER)).toBe(false);
  });

  it("lets projects sales executive view all but not administer", () => {
    expect(canViewAllService(PROJECTS_SALES)).toBe(true);
    expect(canCreateService(PROJECTS_SALES)).toBe(true);
    expect(canAssignService(PROJECTS_SALES)).toBe(false);
    expect(canManageServiceWorkTypes(PROJECTS_SALES)).toBe(false);
    expect(restrictServiceToAssigned(PROJECTS_SALES)).toBe(false);
  });

  it("denies unrelated roles", () => {
    expect(canViewService(OUTSIDER)).toBe(false);
    expect(canCreateService(OUTSIDER)).toBe(false);
    expect(canRecordServicePayment(OUTSIDER)).toBe(false);
  });
});
