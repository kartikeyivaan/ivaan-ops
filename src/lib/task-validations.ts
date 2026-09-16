import { TaskLinkedRecordType, TaskPriority, TaskStatus, TaskType } from "@prisma/client";
import { z } from "zod";

const trimmed = z.string().trim();

export const dueTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
  .optional()
  .or(z.literal(""));

export const createTaskSchema = z
  .object({
    title: trimmed.min(2, "Task title is required.").max(200),
    description: trimmed.max(4000).optional().or(z.literal("")),
    assignedToId: z.string().uuid().optional().nullable(),
    assignToSelf: z.boolean().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date is required.").optional().or(z.literal("")),
    dueTime: dueTimeSchema,
    priority: z.nativeEnum(TaskPriority).optional(),
    linkedRecordType: z.nativeEnum(TaskLinkedRecordType).optional().nullable(),
    linkedRecordId: z.string().uuid().optional().nullable(),
  })
  .refine((data) => Boolean(data.assignToSelf || data.assignedToId), {
    message: "Select an assignee.",
    path: ["assignedToId"],
  })
  .refine(
    (data) => {
      const self = Boolean(data.assignToSelf) || false;
      if (self) return true;
      return Boolean(data.dueDate);
    },
    { message: "Due date is required for assigned tasks.", path: ["dueDate"] },
  )
  .refine(
    (data) => Boolean(data.linkedRecordType) === Boolean(data.linkedRecordId),
    { message: "Linked record type and id must be provided together.", path: ["linkedRecordId"] },
  );

export const taskListQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  taskType: z.nativeEnum(TaskType).optional(),
  assigneeId: z.string().uuid().optional(),
  assignerId: z.string().uuid().optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === "true" ? true : value === "false" ? false : undefined)),
  linkedRecordType: z.nativeEnum(TaskLinkedRecordType).optional(),
  dueFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: trimmed.max(200).optional(),
  companyId: z.string().uuid().optional(),
  view: z
    .enum(["needs_action", "today", "overdue", "in_progress", "completed", "todo"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const rejectTaskSchema = z.object({
  reason: trimmed.min(2, "A rejection reason is required.").max(2000),
});

export const completeTaskSchema = z.object({
  note: trimmed.max(2000).optional().or(z.literal("")),
});

export const cancelTaskSchema = z.object({
  reason: trimmed.min(2, "A cancellation reason is required.").max(2000),
});

export const reassignTaskSchema = z.object({
  assignedToId: z.string().uuid(),
  reason: trimmed.max(2000).optional().or(z.literal("")),
});

export const requestReassignmentSchema = z.object({
  reason: trimmed.min(2, "A reason is required.").max(2000),
  requestedToId: z.string().uuid().optional().nullable(),
});

export const decideReassignmentSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  assignedToId: z.string().uuid().optional(),
  note: trimmed.max(2000).optional().or(z.literal("")),
});

export const addTaskCommentSchema = z.object({
  comment: trimmed.min(1, "Comment cannot be empty.").max(4000),
});
