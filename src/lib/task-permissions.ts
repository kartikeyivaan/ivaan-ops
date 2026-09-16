import { TaskStatus, TaskType } from "@prisma/client";
import { ROLES, hasRole, isSuperAdmin } from "@/lib/rbac";
import { isClosedTaskStatus } from "@/lib/task-overdue";

const MANAGER_ROLES = [ROLES.SALES_MANAGER, ROLES.PROJECTS_MANAGER] as const;

export type TaskActor = {
  id: string;
  roles: string[];
};

export type TaskVisibilityRecord = {
  taskType: TaskType;
  createdById: string | null;
  assignedToId: string;
  companyId: string | null;
  status: TaskStatus;
};

export function canUseTasks(_userRoles: string[]): boolean {
  return true;
}

export function canViewTeamTasks(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles) || hasRole(userRoles, [...MANAGER_ROLES]);
}

export function canViewAllTasks(userRoles: string[]): boolean {
  return isSuperAdmin(userRoles);
}

export function canManageTeamTasks(userRoles: string[]): boolean {
  return canViewTeamTasks(userRoles);
}

export function isTaskManager(userRoles: string[]): boolean {
  return canViewTeamTasks(userRoles);
}

export function isSelfTask(task: { taskType: TaskType }): boolean {
  return task.taskType === TaskType.SELF;
}

export function isTaskAssigner(task: TaskVisibilityRecord, userId: string): boolean {
  return task.createdById === userId;
}

export function isTaskAssignee(task: TaskVisibilityRecord, userId: string): boolean {
  return task.assignedToId === userId;
}

export function canViewTask(
  task: TaskVisibilityRecord,
  actor: TaskActor,
  accessibleCompanyIds: string[],
): boolean {
  if (isSelfTask(task)) {
    return task.assignedToId === actor.id;
  }

  if (isTaskAssignee(task, actor.id) || isTaskAssigner(task, actor.id)) {
    return true;
  }

  if (!canViewTeamTasks(actor.roles)) {
    return false;
  }

  if (canViewAllTasks(actor.roles)) {
    return true;
  }

  if (!task.companyId) {
    return true;
  }

  return accessibleCompanyIds.includes(task.companyId);
}

export function canCommentOnTask(
  task: TaskVisibilityRecord,
  actor: TaskActor,
  accessibleCompanyIds: string[],
): boolean {
  return canViewTask(task, actor, accessibleCompanyIds);
}

export function canAcknowledgeTask(task: TaskVisibilityRecord, actor: TaskActor): boolean {
  return (
    !isSelfTask(task) &&
    isTaskAssignee(task, actor.id) &&
    task.status === TaskStatus.PENDING_ACKNOWLEDGEMENT
  );
}

export function canRejectTask(task: TaskVisibilityRecord, actor: TaskActor): boolean {
  return canAcknowledgeTask(task, actor);
}

export function canStartTask(task: TaskVisibilityRecord, actor: TaskActor): boolean {
  if (!isTaskAssignee(task, actor.id)) return false;
  if (isSelfTask(task)) return task.status === TaskStatus.TO_DO;
  return task.status === TaskStatus.ACKNOWLEDGED;
}

export function canCompleteTask(task: TaskVisibilityRecord, actor: TaskActor): boolean {
  if (!isTaskAssignee(task, actor.id)) return false;
  if (isClosedTaskStatus(task.status)) return false;
  if (isSelfTask(task)) {
    return task.status === TaskStatus.TO_DO || task.status === TaskStatus.IN_PROGRESS;
  }
  return task.status === TaskStatus.ACKNOWLEDGED || task.status === TaskStatus.IN_PROGRESS;
}

export function canCancelTask(
  task: TaskVisibilityRecord,
  actor: TaskActor,
  accessibleCompanyIds: string[],
): boolean {
  if (isClosedTaskStatus(task.status)) return false;
  if (isSelfTask(task)) return task.assignedToId === actor.id;
  if (isTaskAssigner(task, actor.id) || canManageTeamTasks(actor.roles)) {
    if (canViewAllTasks(actor.roles) || isTaskAssigner(task, actor.id)) return true;
    if (!task.companyId) return canManageTeamTasks(actor.roles);
    return accessibleCompanyIds.includes(task.companyId);
  }
  return false;
}

export function canReassignTask(
  task: TaskVisibilityRecord,
  actor: TaskActor,
  accessibleCompanyIds: string[],
): boolean {
  if (isSelfTask(task) || isClosedTaskStatus(task.status)) return false;
  if (isTaskAssigner(task, actor.id)) return true;
  if (!canManageTeamTasks(actor.roles)) return false;
  if (canViewAllTasks(actor.roles)) return true;
  if (!task.companyId) return true;
  return accessibleCompanyIds.includes(task.companyId);
}

export function canRequestReassignment(task: TaskVisibilityRecord, actor: TaskActor): boolean {
  return (
    !isSelfTask(task) &&
    isTaskAssignee(task, actor.id) &&
    !isTaskAssigner(task, actor.id) &&
    !isClosedTaskStatus(task.status)
  );
}

export function canDecideReassignment(
  task: TaskVisibilityRecord,
  actor: TaskActor,
  accessibleCompanyIds: string[],
): boolean {
  return canReassignTask(task, actor, accessibleCompanyIds);
}

export function excludePrivateTasks<T extends { taskType: TaskType }>(
  tasks: T[],
): T[] {
  return tasks.filter((task) => task.taskType !== TaskType.SELF);
}
