import { TaskStatus, TaskType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/rbac";
import {
  canAcknowledgeTask,
  canCancelTask,
  canCompleteTask,
  canReassignTask,
  canRequestReassignment,
  canStartTask,
  canViewAllTasks,
  canViewTask,
  canViewTeamTasks,
} from "@/lib/task-permissions";

const companyA = "11111111-1111-1111-1111-111111111111";
const companyB = "22222222-2222-2222-2222-222222222222";

const assigned = {
  taskType: TaskType.ASSIGNED,
  createdById: "assigner",
  assignedToId: "assignee",
  companyId: companyA,
  status: TaskStatus.PENDING_ACKNOWLEDGEMENT,
};

const selfTask = {
  ...assigned,
  taskType: TaskType.SELF,
  createdById: "owner",
  assignedToId: "owner",
  status: TaskStatus.TO_DO,
};

describe("task visibility", () => {
  it("keeps self tasks private to the owner", () => {
    expect(canViewTask(selfTask, { id: "owner", roles: [ROLES.SALES_EXECUTIVE] }, [companyA])).toBe(true);
    expect(canViewTask(selfTask, { id: "assigner", roles: [ROLES.SALES_MANAGER] }, [companyA])).toBe(false);
    expect(canViewTask(selfTask, { id: "admin", roles: [ROLES.SUPER_ADMIN] }, [companyA])).toBe(false);
  });

  it("lets assignee, assigner, managers, and super admin see assigned tasks", () => {
    expect(canViewTask(assigned, { id: "assignee", roles: [ROLES.WAREHOUSE] }, [companyA])).toBe(true);
    expect(canViewTask(assigned, { id: "assigner", roles: [ROLES.ACCOUNTS] }, [companyA])).toBe(true);
    expect(canViewTask(assigned, { id: "manager", roles: [ROLES.SALES_MANAGER] }, [companyA])).toBe(true);
    expect(canViewTask(assigned, { id: "admin", roles: [ROLES.SUPER_ADMIN] }, [companyB])).toBe(true);
    expect(canViewTask(assigned, { id: "outsider", roles: [ROLES.WAREHOUSE] }, [companyA])).toBe(false);
  });

  it("does not let a manager see another company's assigned task", () => {
    expect(canViewTask(assigned, { id: "manager", roles: [ROLES.SALES_MANAGER] }, [companyB])).toBe(false);
  });

  it("limits team and all-task views to managers and super admin", () => {
    expect(canViewTeamTasks([ROLES.SALES_EXECUTIVE])).toBe(false);
    expect(canViewTeamTasks([ROLES.SALES_MANAGER])).toBe(true);
    expect(canViewAllTasks([ROLES.SALES_MANAGER])).toBe(false);
    expect(canViewAllTasks([ROLES.SUPER_ADMIN])).toBe(true);
  });
});

describe("task actions", () => {
  it("requires acknowledgement only for assigned tasks", () => {
    expect(canAcknowledgeTask(assigned, { id: "assignee", roles: [] })).toBe(true);
    expect(canAcknowledgeTask(assigned, { id: "assigner", roles: [] })).toBe(false);
    expect(canAcknowledgeTask(selfTask, { id: "owner", roles: [] })).toBe(false);
  });

  it("allows the assignee to start and complete after acknowledgement", () => {
    const acknowledged = { ...assigned, status: TaskStatus.ACKNOWLEDGED };
    expect(canStartTask(acknowledged, { id: "assignee", roles: [] })).toBe(true);
    expect(canCompleteTask(acknowledged, { id: "assignee", roles: [] })).toBe(true);
    expect(canStartTask(acknowledged, { id: "assigner", roles: [] })).toBe(false);
  });

  it("lets the owner start a self task without acknowledgement", () => {
    expect(canStartTask(selfTask, { id: "owner", roles: [] })).toBe(true);
    expect(canCompleteTask(selfTask, { id: "owner", roles: [] })).toBe(true);
  });

  it("lets assigner and manager reassign, but not the assignee silently", () => {
    expect(canReassignTask(assigned, { id: "assigner", roles: [] }, [companyA])).toBe(true);
    expect(canReassignTask(assigned, { id: "manager", roles: [ROLES.SALES_MANAGER] }, [companyA])).toBe(true);
    expect(canReassignTask(assigned, { id: "assignee", roles: [] }, [companyA])).toBe(false);
    expect(canRequestReassignment(assigned, { id: "assignee", roles: [] })).toBe(true);
  });

  it("lets the assigner cancel an open assigned task", () => {
    expect(canCancelTask(assigned, { id: "assigner", roles: [] }, [companyA])).toBe(true);
    expect(canCancelTask(assigned, { id: "assignee", roles: [] }, [companyA])).toBe(false);
    expect(canCancelTask({ ...assigned, status: TaskStatus.COMPLETED }, { id: "assigner", roles: [] }, [companyA])).toBe(false);
  });
});
