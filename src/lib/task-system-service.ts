import {
  TaskStatus,
  TaskType,
  type Prisma,
  type PrismaClient,
  type TaskLinkedRecordType,
  type TaskPriority,
} from "@prisma/client";
import { createSystemTask, type TaskActorContext } from "@/lib/task-service";

export const SYSTEM_TASK_TRIGGERS = {
  QUOTATION_FOLLOW_UP: "QUOTATION_FOLLOW_UP",
  PAYMENT_FOLLOW_UP: "PAYMENT_FOLLOW_UP",
  DCR_PENDING: "DCR_PENDING",
  SERVICE_FOLLOW_UP: "SERVICE_FOLLOW_UP",
  PURCHASE_REQUEST_PENDING: "PURCHASE_REQUEST_PENDING",
  INVENTORY_AUDIT_DUE: "INVENTORY_AUDIT_DUE",
} as const;

export type SystemTaskTriggerKey =
  (typeof SYSTEM_TASK_TRIGGERS)[keyof typeof SYSTEM_TASK_TRIGGERS];

export type SystemTaskRule = {
  triggerKey: string;
  sourceType: TaskLinkedRecordType;
  title: (input: SystemTaskCreateInput) => string;
  reason: (input: SystemTaskCreateInput) => string;
  defaultPriority?: TaskPriority;
};

export type SystemTaskCreateInput = {
  triggerKey: string;
  sourceType: TaskLinkedRecordType;
  sourceId: string;
  assignedToId: string;
  companyId?: string | null;
  title?: string;
  description?: string;
  reason?: string;
  dueDate: string;
  dueTime?: string | null;
  priority?: TaskPriority;
};

const registeredRules = new Map<string, SystemTaskRule>();

export function registerSystemTaskRule(rule: SystemTaskRule) {
  registeredRules.set(rule.triggerKey, rule);
  return rule;
}

export function getSystemTaskRule(triggerKey: string): SystemTaskRule | undefined {
  return registeredRules.get(triggerKey);
}

export function listSystemTaskRules(): SystemTaskRule[] {
  return [...registeredRules.values()];
}

registerSystemTaskRule({
  triggerKey: SYSTEM_TASK_TRIGGERS.QUOTATION_FOLLOW_UP,
  sourceType: "QUOTATION",
  title: (input) => input.title ?? "Quotation follow-up due",
  reason: (input) => input.reason ?? "Quotation follow-up is due.",
});

registerSystemTaskRule({
  triggerKey: SYSTEM_TASK_TRIGGERS.PAYMENT_FOLLOW_UP,
  sourceType: "PAYMENT",
  title: (input) => input.title ?? "Payment follow-up due",
  reason: (input) => input.reason ?? "Payment follow-up is due.",
});

registerSystemTaskRule({
  triggerKey: SYSTEM_TASK_TRIGGERS.DCR_PENDING,
  sourceType: "INVOICE",
  title: (input) => input.title ?? "DCR pending after invoice",
  reason: (input) => input.reason ?? "Documentation (DCR) is pending after invoice.",
});

registerSystemTaskRule({
  triggerKey: SYSTEM_TASK_TRIGGERS.SERVICE_FOLLOW_UP,
  sourceType: "SERVICE_COMPLAINT",
  title: (input) => input.title ?? "Service complaint follow-up due",
  reason: (input) => input.reason ?? "Service complaint follow-up is due.",
});

registerSystemTaskRule({
  triggerKey: SYSTEM_TASK_TRIGGERS.PURCHASE_REQUEST_PENDING,
  sourceType: "PURCHASE_REQUEST",
  title: (input) => input.title ?? "Purchase request pending",
  reason: (input) => input.reason ?? "Purchase request is still pending.",
});

registerSystemTaskRule({
  triggerKey: SYSTEM_TASK_TRIGGERS.INVENTORY_AUDIT_DUE,
  sourceType: "INVENTORY_AUDIT",
  title: (input) => input.title ?? "Inventory audit due",
  reason: (input) => input.reason ?? "Inventory audit is due.",
});

export async function createSystemTaskIdempotent(
  client: PrismaClient | Prisma.TransactionClient,
  input: SystemTaskCreateInput,
  actor: TaskActorContext | null = null,
) {
  const rule = getSystemTaskRule(input.triggerKey);
  return createSystemTask(client, {
    triggerKey: input.triggerKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    assignedToId: input.assignedToId,
    companyId: input.companyId ?? null,
    title: input.title ?? rule?.title(input) ?? "System task",
    description: input.description ?? null,
    reason: input.reason ?? rule?.reason(input) ?? "System generated task.",
    dueDate: input.dueDate,
    dueTime: input.dueTime ?? null,
    priority: input.priority ?? rule?.defaultPriority,
  }, actor);
}

export const ACTIVE_SYSTEM_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.PENDING_ACKNOWLEDGEMENT,
  TaskStatus.ACKNOWLEDGED,
  TaskStatus.IN_PROGRESS,
];

export function systemTaskDedupWhere(input: {
  triggerKey: string;
  sourceType: TaskLinkedRecordType;
  sourceId: string;
}): Prisma.TaskWhereInput {
  return {
    taskType: TaskType.SYSTEM,
    systemTriggerKey: input.triggerKey,
    linkedRecordType: input.sourceType,
    linkedRecordId: input.sourceId,
    status: { in: ACTIVE_SYSTEM_TASK_STATUSES },
  };
}
