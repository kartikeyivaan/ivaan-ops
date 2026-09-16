import {
  AuditAction,
  Prisma,
  TaskActivityType,
  TaskPriority,
  TaskReassignmentRequestStatus,
  TaskStatus,
  TaskType,
  UserStatus,
  type PrismaClient,
  type Task,
  type TaskLinkedRecordType,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { getBusinessToday, parseBusinessDate } from "@/lib/business-dates";
import { createNotification } from "@/lib/notification-service";
import {
  assertLinkedRecordAccessible,
  resolveLinkedRecord,
  type LinkedRecordRef,
} from "@/lib/task-linked-record";
import {
  isTaskOverdue,
  isTaskDueToday,
  isClosedTaskStatus,
} from "@/lib/task-overdue";
import {
  canAcknowledgeTask,
  canCancelTask,
  canCommentOnTask,
  canCompleteTask,
  canDecideReassignment,
  canReassignTask,
  canRejectTask,
  canRequestReassignment,
  canStartTask,
  canViewAllTasks,
  canViewTask,
  canViewTeamTasks,
  isSelfTask,
  type TaskActor,
} from "@/lib/task-permissions";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type TaskActorContext = TaskActor & {
  companyId: string | null;
  accessibleCompanyIds: string[];
};

export type TaskListFilters = {
  status?: TaskStatus;
  priority?: TaskPriority;
  taskType?: TaskType;
  assigneeId?: string;
  assignerId?: string;
  overdue?: boolean;
  linkedRecordType?: TaskLinkedRecordType;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  companyId?: string;
  view?: "needs_action" | "today" | "overdue" | "in_progress" | "completed" | "todo";
  limit?: number;
  offset?: number;
};

const taskInclude = {
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  acknowledgedBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  company: { select: { id: true, name: true, code: true } },
} satisfies Prisma.TaskInclude;

type TaskWithPeople = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function taskHref(taskId: string) {
  return `/tasks/${taskId}`;
}

async function addActivity(
  client: DbClient,
  input: {
    taskId: string;
    actorUserId?: string | null;
    activityType: TaskActivityType;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return client.taskActivity.create({
    data: {
      taskId: input.taskId,
      actorUserId: input.actorUserId ?? null,
      activityType: input.activityType,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}

async function notifyUsers(
  client: DbClient,
  userIds: Array<string | null | undefined>,
  input: { title: string; message: string; href: string },
) {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(
    unique.map((userId) =>
      createNotification(
        {
          userId,
          title: input.title,
          message: input.message,
          module: "tasks",
          href: input.href,
        },
        client,
      ),
    ),
  );
}

async function requireActiveUser(client: DbClient, userId: string) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, status: true },
  });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new Error("INVALID_ASSIGNEE");
  }
  return user;
}

function applyOverdueFilter(
  where: Prisma.TaskWhereInput,
  overdue: boolean,
  asOf = new Date(),
) {
  const today = getBusinessToday(asOf);
  const todayDate = parseBusinessDate(today);
  if (overdue) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] } },
      { dueDate: { not: null, lte: todayDate } },
    ];
  }
}

function applySearchFilter(where: Prisma.TaskWhereInput, q?: string) {
  if (!q?.trim()) return;
  const query = q.trim();
  where.OR = [
    { title: { contains: query, mode: "insensitive" } },
    { description: { contains: query, mode: "insensitive" } },
    { linkedRecordId: { equals: query } },
  ];
}

function applyCommonFilters(filters: TaskListFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.taskType) where.taskType = filters.taskType;
  if (filters.assigneeId) where.assignedToId = filters.assigneeId;
  if (filters.assignerId) where.createdById = filters.assignerId;
  if (filters.linkedRecordType) where.linkedRecordType = filters.linkedRecordType;
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.dueFrom || filters.dueTo) {
    where.dueDate = {
      ...(filters.dueFrom ? { gte: parseBusinessDate(filters.dueFrom) } : {}),
      ...(filters.dueTo ? { lte: parseBusinessDate(filters.dueTo) } : {}),
    };
  }
  if (filters.overdue) applyOverdueFilter(where, true);
  applySearchFilter(where, filters.q);

  const today = parseBusinessDate(getBusinessToday());
  if (filters.view === "needs_action") {
    where.OR = [
      { status: TaskStatus.PENDING_ACKNOWLEDGEMENT },
      {
        priority: TaskPriority.URGENT,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
      },
    ];
  } else if (filters.view === "today") {
    where.dueDate = today;
    where.status = { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] };
  } else if (filters.view === "overdue") {
    applyOverdueFilter(where, true);
  } else if (filters.view === "in_progress") {
    where.status = TaskStatus.IN_PROGRESS;
  } else if (filters.view === "completed") {
    where.status = TaskStatus.COMPLETED;
  } else if (filters.view === "todo") {
    where.status = TaskStatus.TO_DO;
  }

  return where;
}

export async function decorateTask(
  client: DbClient,
  task: TaskWithPeople | Task,
  asOf = new Date(),
) {
  const linkedRecord =
    task.linkedRecordType && task.linkedRecordId
      ? await resolveLinkedRecord(client, task.linkedRecordType, task.linkedRecordId)
      : null;
  return {
    ...task,
    isOverdue: isTaskOverdue(task, asOf),
    isDueToday: isTaskDueToday(task, asOf),
    linkedRecord,
  };
}

async function decorateTasks(client: DbClient, tasks: TaskWithPeople[], asOf = new Date()) {
  return Promise.all(tasks.map((task) => decorateTask(client, task, asOf)));
}

async function loadTask(client: DbClient, id: string) {
  const task = await client.task.findUnique({
    where: { id },
    include: taskInclude,
  });
  if (!task) throw new Error("NOT_FOUND");
  return task;
}

function assertVisible(task: TaskWithPeople, actor: TaskActorContext) {
  if (!canViewTask(task, actor, actor.accessibleCompanyIds)) {
    throw new Error(isSelfTask(task) ? "PRIVATE_TASK" : "FORBIDDEN");
  }
}

export async function listTaskAssignees(client: DbClient) {
  return client.user.findMany({
    where: { status: UserStatus.ACTIVE },
    select: {
      id: true,
      name: true,
      email: true,
      roles: { select: { role: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createUserTask(
  client: PrismaClient,
  actor: TaskActorContext,
  input: {
    title: string;
    description?: string | null;
    assignedToId?: string | null;
    assignToSelf?: boolean;
    dueDate?: string | null;
    dueTime?: string | null;
    priority?: TaskPriority;
    linkedRecordType?: TaskLinkedRecordType | null;
    linkedRecordId?: string | null;
  },
) {
  const assignToSelf = Boolean(input.assignToSelf) || input.assignedToId === actor.id;
  const assignedToId = assignToSelf ? actor.id : input.assignedToId;
  if (!assignedToId) throw new Error("ASSIGNEE_REQUIRED");

  if (!assignToSelf && !input.dueDate) throw new Error("DUE_DATE_REQUIRED");

  const assignee = await requireActiveUser(client, assignedToId);
  if (assignToSelf && assignedToId !== actor.id) throw new Error("SELF_ASSIGN_ONLY");

  let linked: LinkedRecordRef | null = null;
  if (input.linkedRecordType && input.linkedRecordId) {
    linked = await assertLinkedRecordAccessible(
      client,
      input.linkedRecordType,
      input.linkedRecordId,
      actor.accessibleCompanyIds,
    );
  }

  const companyId = linked?.companyId ?? actor.companyId;
  const taskType = assignToSelf ? TaskType.SELF : TaskType.ASSIGNED;
  const status = assignToSelf ? TaskStatus.TO_DO : TaskStatus.PENDING_ACKNOWLEDGEMENT;

  return client.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        companyId,
        taskType,
        title: input.title,
        description: input.description || null,
        createdById: actor.id,
        assignedToId,
        dueDate: input.dueDate ? parseBusinessDate(input.dueDate) : null,
        dueTime: input.dueTime || null,
        priority: input.priority ?? TaskPriority.NORMAL,
        status,
        linkedRecordType: linked?.type ?? null,
        linkedRecordId: linked?.id ?? null,
      },
      include: taskInclude,
    });

    await addActivity(tx, {
      taskId: task.id,
      actorUserId: actor.id,
      activityType: TaskActivityType.CREATED,
      metadata: { taskType, title: task.title },
    });
    await addActivity(tx, {
      taskId: task.id,
      actorUserId: actor.id,
      activityType: TaskActivityType.ASSIGNED,
      metadata: { assignedToId, assignedToName: assignee.name },
    });
    await writeAuditLogTx(tx, {
      tableName: "tasks",
      recordId: task.id,
      action: AuditAction.CREATE,
      newValue: { title: task.title, taskType, assignedToId, status },
      performedBy: actor.id,
      companyId,
      reference: task.title,
    });

    if (!assignToSelf) {
      await notifyUsers(tx, [assignedToId], {
        title: "New task assigned",
        message: `${task.title} was assigned to you.`,
        href: taskHref(task.id),
      });
    }

    return decorateTask(tx, task);
  });
}

export async function createSystemTask(
  client: DbClient,
  input: {
    triggerKey: string;
    sourceType: TaskLinkedRecordType;
    sourceId: string;
    assignedToId: string;
    companyId?: string | null;
    title: string;
    description?: string | null;
    reason: string;
    dueDate: string;
    dueTime?: string | null;
    priority?: TaskPriority;
  },
  actor: TaskActorContext | null = null,
) {
  const existing = await client.task.findFirst({
    where: {
      taskType: TaskType.SYSTEM,
      systemTriggerKey: input.triggerKey,
      linkedRecordType: input.sourceType,
      linkedRecordId: input.sourceId,
      status: {
        in: [TaskStatus.PENDING_ACKNOWLEDGEMENT, TaskStatus.ACKNOWLEDGED, TaskStatus.IN_PROGRESS],
      },
    },
    include: taskInclude,
  });
  if (existing) {
    return { created: false as const, task: await decorateTask(client, existing) };
  }

  await requireActiveUser(client, input.assignedToId);

  let linked: LinkedRecordRef | null = null;
  if (actor) {
    linked = await assertLinkedRecordAccessible(
      client,
      input.sourceType,
      input.sourceId,
      actor.accessibleCompanyIds,
    );
  } else {
    linked = await resolveLinkedRecord(client, input.sourceType, input.sourceId);
  }

  const run = async (tx: Prisma.TransactionClient) => {
    const task = await tx.task.create({
      data: {
        companyId: input.companyId ?? linked?.companyId ?? null,
        taskType: TaskType.SYSTEM,
        title: input.title,
        description: input.description || null,
        createdById: actor?.id ?? null,
        assignedToId: input.assignedToId,
        dueDate: parseBusinessDate(input.dueDate),
        dueTime: input.dueTime || null,
        priority: input.priority ?? TaskPriority.NORMAL,
        status: TaskStatus.PENDING_ACKNOWLEDGEMENT,
        linkedRecordType: input.sourceType,
        linkedRecordId: input.sourceId,
        systemTriggerKey: input.triggerKey,
        systemTriggerReason: input.reason,
      },
      include: taskInclude,
    });

    await addActivity(tx, {
      taskId: task.id,
      actorUserId: actor?.id ?? null,
      activityType: TaskActivityType.CREATED,
      metadata: {
        taskType: TaskType.SYSTEM,
        triggerKey: input.triggerKey,
        reason: input.reason,
      },
    });
    await addActivity(tx, {
      taskId: task.id,
      actorUserId: actor?.id ?? null,
      activityType: TaskActivityType.ASSIGNED,
      metadata: { assignedToId: input.assignedToId },
    });
    await writeAuditLogTx(tx, {
      tableName: "tasks",
      recordId: task.id,
      action: AuditAction.CREATE,
      newValue: {
        title: task.title,
        taskType: TaskType.SYSTEM,
        triggerKey: input.triggerKey,
        assignedToId: input.assignedToId,
      },
      performedBy: actor?.id ?? null,
      companyId: task.companyId,
      reference: input.triggerKey,
    });
    await notifyUsers(tx, [input.assignedToId], {
      title: "New system task",
      message: task.title,
      href: taskHref(task.id),
    });
    return decorateTask(tx, task);
  };

  try {
    const task =
      "$transaction" in client
        ? await (client as PrismaClient).$transaction(run)
        : await run(client as Prisma.TransactionClient);
    return { created: true as const, task };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await client.task.findFirst({
        where: {
          taskType: TaskType.SYSTEM,
          systemTriggerKey: input.triggerKey,
          linkedRecordType: input.sourceType,
          linkedRecordId: input.sourceId,
          status: {
            in: [TaskStatus.PENDING_ACKNOWLEDGEMENT, TaskStatus.ACKNOWLEDGED, TaskStatus.IN_PROGRESS],
          },
        },
        include: taskInclude,
      });
      if (again) {
        return { created: false as const, task: await decorateTask(client, again) };
      }
    }
    throw error;
  }
}

async function listTasks(
  client: DbClient,
  where: Prisma.TaskWhereInput,
  filters: TaskListFilters,
) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const [items, total] = await Promise.all([
    client.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
    }),
    client.task.count({ where }),
  ]);
  const decorated = await decorateTasks(client, items);
  const filtered =
    filters.overdue || filters.view === "overdue"
      ? decorated.filter((task) => task.isOverdue)
      : decorated;
  return { items: filtered, total, limit, offset };
}

export async function listMyTasks(client: DbClient, actor: TaskActorContext, filters: TaskListFilters) {
  const where: Prisma.TaskWhereInput = {
    assignedToId: actor.id,
    taskType: { in: [TaskType.ASSIGNED, TaskType.SYSTEM] },
    AND: [applyCommonFilters(filters)],
  };
  return listTasks(client, where, filters);
}

export async function listMyTodo(client: DbClient, actor: TaskActorContext, filters: TaskListFilters) {
  const where: Prisma.TaskWhereInput = {
    assignedToId: actor.id,
    taskType: TaskType.SELF,
    AND: [applyCommonFilters({ ...filters, taskType: TaskType.SELF })],
  };
  return listTasks(client, where, filters);
}

export async function listAssignedByMe(
  client: DbClient,
  actor: TaskActorContext,
  filters: TaskListFilters,
) {
  const where: Prisma.TaskWhereInput = {
    createdById: actor.id,
    assignedToId: { not: actor.id },
    taskType: { not: TaskType.SELF },
    AND: [applyCommonFilters(filters)],
  };
  return listTasks(client, where, filters);
}

export async function listTeamTasks(
  client: DbClient,
  actor: TaskActorContext,
  filters: TaskListFilters,
) {
  if (!canViewTeamTasks(actor.roles)) throw new Error("FORBIDDEN");
  const where: Prisma.TaskWhereInput = {
    taskType: { not: TaskType.SELF },
    ...(canViewAllTasks(actor.roles)
      ? {}
      : { OR: [{ companyId: { in: actor.accessibleCompanyIds } }, { companyId: null }] }),
    AND: [applyCommonFilters(filters)],
  };
  const result = await listTasks(client, where, filters);

  const openWhere: Prisma.TaskWhereInput = {
    ...where,
    status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
  };
  const openTasks = await client.task.findMany({
    where: openWhere,
    select: {
      assignedToId: true,
      assignedTo: { select: { name: true } },
      dueDate: true,
      dueTime: true,
      status: true,
    },
  });
  const today = getBusinessToday();
  const byEmployee = new Map<
    string,
    { employeeId: string; employeeName: string; open: number; dueToday: number; overdue: number }
  >();
  for (const task of openTasks) {
    const current = byEmployee.get(task.assignedToId) ?? {
      employeeId: task.assignedToId,
      employeeName: task.assignedTo.name,
      open: 0,
      dueToday: 0,
      overdue: 0,
    };
    current.open += 1;
    if (isTaskDueToday(task)) current.dueToday += 1;
    if (isTaskOverdue(task)) current.overdue += 1;
    byEmployee.set(task.assignedToId, current);
  }

  return {
    ...result,
    employeeSummary: [...byEmployee.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    today,
  };
}

export async function listAllTasks(client: DbClient, actor: TaskActorContext, filters: TaskListFilters) {
  if (!canViewAllTasks(actor.roles)) throw new Error("FORBIDDEN");
  const where: Prisma.TaskWhereInput = {
    taskType: { not: TaskType.SELF },
    AND: [applyCommonFilters(filters)],
  };
  return listTasks(client, where, filters);
}

export async function getTaskDetail(client: DbClient, actor: TaskActorContext, id: string) {
  const task = await loadTask(client, id);
  assertVisible(task, actor);
  const [comments, activities, reassignmentRequests, decorated] = await Promise.all([
    client.taskComment.findMany({
      where: { taskId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    client.taskActivity.findMany({
      where: { taskId: id },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    client.taskReassignmentRequest.findMany({
      where: { taskId: id },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    decorateTask(client, task),
  ]);
  return { ...decorated, comments, activities, reassignmentRequests };
}

export async function acknowledgeTask(client: PrismaClient, actor: TaskActorContext, id: string) {
  const task = await loadTask(client, id);
  if (!canAcknowledgeTask(task, actor)) throw new Error("INVALID_TRANSITION");

  return client.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        status: TaskStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedById: actor.id,
      },
      include: taskInclude,
    });
    await addActivity(tx, {
      taskId: id,
      actorUserId: actor.id,
      activityType: TaskActivityType.ACKNOWLEDGED,
    });
    await writeAuditLogTx(tx, {
      tableName: "tasks",
      recordId: id,
      action: AuditAction.UPDATE,
      oldValue: { status: task.status },
      newValue: { status: TaskStatus.ACKNOWLEDGED },
      performedBy: actor.id,
      companyId: task.companyId,
    });
    await notifyUsers(tx, [task.createdById], {
      title: "Task acknowledged",
      message: `${updated.title} was acknowledged.`,
      href: taskHref(id),
    });
    return decorateTask(tx, updated);
  });
}

export async function rejectTask(
  client: PrismaClient,
  actor: TaskActorContext,
  id: string,
  reason: string,
) {
  const task = await loadTask(client, id);
  if (!canRejectTask(task, actor)) throw new Error("INVALID_TRANSITION");
  if (!reason.trim()) throw new Error("REASON_REQUIRED");

  return client.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        status: TaskStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason.trim(),
      },
      include: taskInclude,
    });
    await addActivity(tx, {
      taskId: id,
      actorUserId: actor.id,
      activityType: TaskActivityType.REJECTED,
      metadata: { reason: reason.trim() },
    });
    await writeAuditLogTx(tx, {
      tableName: "tasks",
      recordId: id,
      action: AuditAction.UPDATE,
      oldValue: { status: task.status },
      newValue: { status: TaskStatus.REJECTED, reason: reason.trim() },
      performedBy: actor.id,
      companyId: task.companyId,
      reason: reason.trim(),
    });
    await notifyUsers(tx, [task.createdById], {
      title: "Task rejected",
      message: `${updated.title} was rejected.`,
      href: taskHref(id),
    });
    return decorateTask(tx, updated);
  });
}

export async function startTask(client: PrismaClient, actor: TaskActorContext, id: string) {
  const task = await loadTask(client, id);
  if (!canStartTask(task, actor)) throw new Error("INVALID_TRANSITION");

  return client.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: { status: TaskStatus.IN_PROGRESS },
      include: taskInclude,
    });
    await addActivity(tx, {
      taskId: id,
      actorUserId: actor.id,
      activityType: TaskActivityType.STATUS_CHANGED,
      metadata: { from: task.status, to: TaskStatus.IN_PROGRESS },
    });
    await writeAuditLogTx(tx, {
      tableName: "tasks",
      recordId: id,
      action: AuditAction.UPDATE,
      oldValue: { status: task.status },
      newValue: { status: TaskStatus.IN_PROGRESS },
      performedBy: actor.id,
      companyId: task.companyId,
    });
    return decorateTask(tx, updated);
  });
}

export async function completeTask(
  client: PrismaClient,
  actor: TaskActorContext,
  id: string,
  note?: string | null,
) {
  const task = await loadTask(client, id);
  if (!canCompleteTask(task, actor)) throw new Error("INVALID_TRANSITION");

  return client.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        completedById: actor.id,
        completionNote: note?.trim() || null,
      },
      include: taskInclude,
    });
    await addActivity(tx, {
      taskId: id,
      actorUserId: actor.id,
      activityType: TaskActivityType.COMPLETED,
      metadata: { note: note?.trim() || null },
    });
    await writeAuditLogTx(tx, {
      tableName: "tasks",
      recordId: id,
      action: AuditAction.UPDATE,
      oldValue: { status: task.status },
      newValue: { status: TaskStatus.COMPLETED },
      performedBy: actor.id,
      companyId: task.companyId,
    });
    if (!isSelfTask(task)) {
      await notifyUsers(tx, [task.createdById], {
        title: "Task completed",
        message: `${updated.title} was completed.`,
        href: taskHref(id),
      });
    }
    return decorateTask(tx, updated);
  });
}

export async function cancelTask(
  client: PrismaClient,
  actor: TaskActorContext,
  id: string,
  reason: string,
) {
  const task = await loadTask(client, id);
  if (!canCancelTask(task, actor, actor.accessibleCompanyIds)) throw new Error("FORBIDDEN");
  if (!reason.trim()) throw new Error("REASON_REQUIRED");

  return client.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        status: TaskStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancellationReason: reason.trim(),
      },
      include: taskInclude,
    });
    await addActivity(tx, {
      taskId: id,
      actorUserId: actor.id,
      activityType: TaskActivityType.CANCELLED,
      metadata: { reason: reason.trim() },
    });
    await writeAuditLogTx(tx, {
      tableName: "tasks",
      recordId: id,
      action: AuditAction.CANCEL,
      oldValue: { status: task.status },
      newValue: { status: TaskStatus.CANCELLED, reason: reason.trim() },
      performedBy: actor.id,
      companyId: task.companyId,
      reason: reason.trim(),
    });
    return decorateTask(tx, updated);
  });
}

async function applyReassignment(
  tx: Prisma.TransactionClient,
  task: TaskWithPeople,
  actor: TaskActorContext,
  assignedToId: string,
  reason?: string | null,
) {
  if (isClosedTaskStatus(task.status)) throw new Error("INVALID_TRANSITION");
  const assignee = await requireActiveUser(tx, assignedToId);
  const updated = await tx.task.update({
    where: { id: task.id },
    data: {
      assignedToId,
      status: TaskStatus.PENDING_ACKNOWLEDGEMENT,
      acknowledgedAt: null,
      acknowledgedById: null,
      rejectedAt: null,
      rejectionReason: null,
    },
    include: taskInclude,
  });
  await addActivity(tx, {
    taskId: task.id,
    actorUserId: actor.id,
    activityType: TaskActivityType.REASSIGNED,
    metadata: {
      fromUserId: task.assignedToId,
      toUserId: assignedToId,
      toUserName: assignee.name,
      reason: reason?.trim() || null,
    },
  });
  await writeAuditLogTx(tx, {
    tableName: "tasks",
    recordId: task.id,
    action: AuditAction.UPDATE,
    oldValue: { assignedToId: task.assignedToId, status: task.status },
    newValue: { assignedToId, status: TaskStatus.PENDING_ACKNOWLEDGEMENT },
    performedBy: actor.id,
    companyId: task.companyId,
    reason: reason?.trim() || null,
  });
  await notifyUsers(tx, [assignedToId], {
    title: "Task assigned to you",
    message: `${updated.title} was reassigned to you.`,
    href: taskHref(task.id),
  });
  if (task.assignedToId !== actor.id) {
    await notifyUsers(tx, [task.assignedToId], {
      title: "Task reassigned",
      message: `${updated.title} was reassigned.`,
      href: taskHref(task.id),
    });
  }
  return decorateTask(tx, updated);
}

export async function reassignTask(
  client: PrismaClient,
  actor: TaskActorContext,
  id: string,
  assignedToId: string,
  reason?: string | null,
) {
  const task = await loadTask(client, id);
  if (!canReassignTask(task, actor, actor.accessibleCompanyIds)) throw new Error("CANNOT_REASSIGN");
  return client.$transaction((tx) => applyReassignment(tx, task, actor, assignedToId, reason));
}

export async function requestReassignment(
  client: PrismaClient,
  actor: TaskActorContext,
  id: string,
  reason: string,
  requestedToId?: string | null,
) {
  const task = await loadTask(client, id);
  if (!canRequestReassignment(task, actor)) throw new Error("FORBIDDEN");
  if (!reason.trim()) throw new Error("REASON_REQUIRED");
  if (requestedToId) await requireActiveUser(client, requestedToId);

  return client.$transaction(async (tx) => {
    const request = await tx.taskReassignmentRequest.create({
      data: {
        taskId: id,
        requestedById: actor.id,
        requestedToId: requestedToId ?? null,
        reason: reason.trim(),
      },
    });
    await addActivity(tx, {
      taskId: id,
      actorUserId: actor.id,
      activityType: TaskActivityType.REASSIGNMENT_REQUESTED,
      metadata: { reason: reason.trim(), requestedToId: requestedToId ?? null },
    });
    await notifyUsers(tx, [task.createdById], {
      title: "Reassignment requested",
      message: `A reassignment was requested for ${task.title}.`,
      href: taskHref(id),
    });
    return request;
  });
}

export async function decideReassignment(
  client: PrismaClient,
  actor: TaskActorContext,
  taskId: string,
  requestId: string,
  decision: "APPROVE" | "REJECT",
  assignedToId?: string,
  note?: string | null,
) {
  const task = await loadTask(client, taskId);
  if (!canDecideReassignment(task, actor, actor.accessibleCompanyIds)) {
    throw new Error("CANNOT_REASSIGN");
  }

  return client.$transaction(async (tx) => {
    const request = await tx.taskReassignmentRequest.findFirst({
      where: { id: requestId, taskId },
    });
    if (!request) throw new Error("REASSIGNMENT_NOT_FOUND");
    if (request.status !== TaskReassignmentRequestStatus.PENDING) {
      throw new Error("REASSIGNMENT_NOT_PENDING");
    }

    const nextAssignee = assignedToId ?? request.requestedToId;
    await tx.taskReassignmentRequest.update({
      where: { id: requestId },
      data: {
        status:
          decision === "APPROVE"
            ? TaskReassignmentRequestStatus.APPROVED
            : TaskReassignmentRequestStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });
    await addActivity(tx, {
      taskId,
      actorUserId: actor.id,
      activityType: TaskActivityType.REASSIGNMENT_DECIDED,
      metadata: { decision, requestId, note: note?.trim() || null },
    });
    await notifyUsers(tx, [request.requestedById], {
      title: decision === "APPROVE" ? "Reassignment approved" : "Reassignment declined",
      message: `${task.title} reassignment was ${decision === "APPROVE" ? "approved" : "declined"}.`,
      href: taskHref(taskId),
    });

    if (decision === "APPROVE") {
      if (!nextAssignee) throw new Error("ASSIGNEE_REQUIRED");
      return applyReassignment(tx, task, actor, nextAssignee, note);
    }
    return decorateTask(tx, task);
  });
}

export async function addTaskComment(
  client: PrismaClient,
  actor: TaskActorContext,
  id: string,
  comment: string,
) {
  const task = await loadTask(client, id);
  if (!canCommentOnTask(task, actor, actor.accessibleCompanyIds)) throw new Error("FORBIDDEN");
  if (!comment.trim()) throw new Error("REASON_REQUIRED");

  return client.$transaction(async (tx) => {
    const created = await tx.taskComment.create({
      data: { taskId: id, userId: actor.id, comment: comment.trim() },
      include: { user: { select: { id: true, name: true } } },
    });
    await addActivity(tx, {
      taskId: id,
      actorUserId: actor.id,
      activityType: TaskActivityType.COMMENT_ADDED,
      metadata: { comment: comment.trim() },
    });
    const recipients = isSelfTask(task)
      ? []
      : [task.assignedToId, task.createdById].filter((userId) => userId && userId !== actor.id);
    await notifyUsers(tx, recipients, {
      title: "New task comment",
      message: `${created.user.name} commented on ${task.title}.`,
      href: taskHref(id),
    });
    return created;
  });
}

export async function listTaskActivity(client: DbClient, actor: TaskActorContext, id: string) {
  const task = await loadTask(client, id);
  assertVisible(task, actor);
  return client.taskActivity.findMany({
    where: { taskId: id },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getMyTaskCounts(client: DbClient, actor: TaskActorContext) {
  const assignedWhere: Prisma.TaskWhereInput = {
    assignedToId: actor.id,
    taskType: { in: [TaskType.ASSIGNED, TaskType.SYSTEM] },
  };
  const openWhere: Prisma.TaskWhereInput = {
    ...assignedWhere,
    status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
  };
  const today = parseBusinessDate(getBusinessToday());
  const [needsAction, dueToday, inProgress, completed, openTasks] = await Promise.all([
    client.task.count({
      where: {
        ...assignedWhere,
        OR: [
          { status: TaskStatus.PENDING_ACKNOWLEDGEMENT },
          {
            priority: TaskPriority.URGENT,
            status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
          },
        ],
      },
    }),
    client.task.count({
      where: { ...openWhere, dueDate: today },
    }),
    client.task.count({ where: { ...assignedWhere, status: TaskStatus.IN_PROGRESS } }),
    client.task.count({ where: { ...assignedWhere, status: TaskStatus.COMPLETED } }),
    client.task.findMany({
      where: openWhere,
      select: { dueDate: true, dueTime: true, status: true },
    }),
  ]);
  const overdue = openTasks.filter((task) => isTaskOverdue(task)).length;
  return { needsAction, today: dueToday, overdue, inProgress, completed };
}

export async function getTodoCounts(client: DbClient, actor: TaskActorContext) {
  const where = { assignedToId: actor.id, taskType: TaskType.SELF };
  const [todo, inProgress, completed] = await Promise.all([
    client.task.count({ where: { ...where, status: TaskStatus.TO_DO } }),
    client.task.count({ where: { ...where, status: TaskStatus.IN_PROGRESS } }),
    client.task.count({ where: { ...where, status: TaskStatus.COMPLETED } }),
  ]);
  return { todo, inProgress, completed };
}

export async function getAssignedByMeCounts(client: DbClient, actor: TaskActorContext) {
  const where: Prisma.TaskWhereInput = {
    createdById: actor.id,
    assignedToId: { not: actor.id },
    taskType: { not: TaskType.SELF },
  };
  const [all, awaiting, acknowledged, inProgress, completed, rejected, cancelled, openTasks] =
    await Promise.all([
      client.task.count({ where }),
      client.task.count({ where: { ...where, status: TaskStatus.PENDING_ACKNOWLEDGEMENT } }),
      client.task.count({ where: { ...where, status: TaskStatus.ACKNOWLEDGED } }),
      client.task.count({ where: { ...where, status: TaskStatus.IN_PROGRESS } }),
      client.task.count({ where: { ...where, status: TaskStatus.COMPLETED } }),
      client.task.count({ where: { ...where, status: TaskStatus.REJECTED } }),
      client.task.count({ where: { ...where, status: TaskStatus.CANCELLED } }),
      client.task.findMany({
        where: {
          ...where,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
        },
        select: { dueDate: true, dueTime: true, status: true },
      }),
    ]);
  return {
    all,
    awaitingAcknowledgement: awaiting,
    acknowledged,
    inProgress,
    completed,
    rejected,
    cancelled,
    overdue: openTasks.filter((task) => isTaskOverdue(task)).length,
  };
}

export async function getTeamTaskCounts(client: DbClient, actor: TaskActorContext) {
  if (!canViewTeamTasks(actor.roles)) throw new Error("FORBIDDEN");
  const where: Prisma.TaskWhereInput = {
    taskType: { not: TaskType.SELF },
    ...(canViewAllTasks(actor.roles)
      ? {}
      : { OR: [{ companyId: { in: actor.accessibleCompanyIds } }, { companyId: null }] }),
  };
  const today = parseBusinessDate(getBusinessToday());
  const openWhere = {
    ...where,
    status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
  };
  const [open, awaiting, dueToday, completed, openTasks] = await Promise.all([
    client.task.count({ where: openWhere }),
    client.task.count({ where: { ...where, status: TaskStatus.PENDING_ACKNOWLEDGEMENT } }),
    client.task.count({ where: { ...openWhere, dueDate: today } }),
    client.task.count({ where: { ...where, status: TaskStatus.COMPLETED } }),
    client.task.findMany({
      where: openWhere,
      select: { dueDate: true, dueTime: true, status: true },
    }),
  ]);
  return {
    open,
    awaitingAcknowledgement: awaiting,
    dueToday,
    overdue: openTasks.filter((task) => isTaskOverdue(task)).length,
    completed,
  };
}

export async function getAttentionSummary(client: DbClient, actor: TaskActorContext) {
  const assignedWhere: Prisma.TaskWhereInput = {
    assignedToId: actor.id,
    taskType: { in: [TaskType.ASSIGNED, TaskType.SYSTEM] },
    status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
  };
  const today = parseBusinessDate(getBusinessToday());
  const [awaiting, dueToday, openTasks] = await Promise.all([
    client.task.count({
      where: { ...assignedWhere, status: TaskStatus.PENDING_ACKNOWLEDGEMENT },
    }),
    client.task.count({ where: { ...assignedWhere, dueDate: today } }),
    client.task.findMany({
      where: assignedWhere,
      select: { dueDate: true, dueTime: true, status: true },
    }),
  ]);
  const overdue = openTasks.filter((task) => isTaskOverdue(task)).length;
  return {
    total: openTasks.length,
    overdue,
    dueToday,
    awaitingAcknowledgement: awaiting,
  };
}

export async function processTaskReminders(client: PrismaClient, asOf = new Date()) {
  const today = getBusinessToday(asOf);
  const todayDate = parseBusinessDate(today);
  const openWhere: Prisma.TaskWhereInput = {
    taskType: { not: TaskType.SELF },
    status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED] },
    dueDate: { not: null },
  };

  const candidates = await client.task.findMany({
    where: openWhere,
    select: {
      id: true,
      title: true,
      assignedToId: true,
      createdById: true,
      dueDate: true,
      dueTime: true,
      status: true,
      dueReminderOn: true,
      overdueReminderOn: true,
    },
  });

  let dueTodayNotified = 0;
  let overdueNotified = 0;

  for (const task of candidates) {
    if (isTaskDueToday(task, asOf) && !task.dueReminderOn) {
      await client.$transaction(async (tx) => {
        await notifyUsers(tx, [task.assignedToId], {
          title: "Task due today",
          message: `${task.title} is due today.`,
          href: taskHref(task.id),
        });
        await tx.task.update({
          where: { id: task.id },
          data: { dueReminderOn: todayDate },
        });
      });
      dueTodayNotified += 1;
    }

    if (isTaskOverdue(task, asOf) && !task.overdueReminderOn) {
      await client.$transaction(async (tx) => {
        await notifyUsers(tx, [task.assignedToId, task.createdById], {
          title: "Task overdue",
          message: `${task.title} is overdue.`,
          href: taskHref(task.id),
        });
        await tx.task.update({
          where: { id: task.id },
          data: { overdueReminderOn: todayDate },
        });
      });
      overdueNotified += 1;
    }
  }

  return { dueTodayNotified, overdueNotified };
}

export async function listNotifications(client: DbClient, userId: string, unreadOnly = false) {
  return client.notification.findMany({
    where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(client: DbClient, userId: string, id: string) {
  const notification = await client.notification.findFirst({ where: { id, userId } });
  if (!notification) throw new Error("NOT_FOUND");
  return client.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(client: DbClient, userId: string) {
  return client.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
