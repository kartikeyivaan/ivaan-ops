import {
  TaskActivityType,
  TaskPriority,
  TaskStatus,
  TaskType,
  type TaskLinkedRecordType,
} from "@prisma/client";
import { LINKED_RECORD_LABELS } from "@/lib/task-linked-record";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING_ACKNOWLEDGEMENT: "Pending Acknowledgement",
  ACKNOWLEDGED: "Acknowledged",
  TO_DO: "To-Do",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  ASSIGNED: "Assigned Task",
  SELF: "Private To-Do",
  SYSTEM: "System Generated",
};

export const TASK_ACTIVITY_LABELS: Record<TaskActivityType, string> = {
  CREATED: "created the task",
  ASSIGNED: "assigned the task",
  ACKNOWLEDGED: "acknowledged the task",
  REJECTED: "rejected the task",
  STATUS_CHANGED: "changed the status",
  REASSIGNED: "reassigned the task",
  REASSIGNMENT_REQUESTED: "requested reassignment",
  REASSIGNMENT_DECIDED: "reviewed a reassignment request",
  COMMENT_ADDED: "added a comment",
  COMPLETED: "completed the task",
  CANCELLED: "cancelled the task",
};

export function taskStatusVariant(
  status: TaskStatus,
): "default" | "success" | "warning" | "danger" {
  if (status === TaskStatus.COMPLETED) return "success";
  if (status === TaskStatus.IN_PROGRESS || status === TaskStatus.ACKNOWLEDGED) return "warning";
  if (status === TaskStatus.REJECTED || status === TaskStatus.CANCELLED) return "danger";
  return "default";
}

export function taskPriorityVariant(
  priority: TaskPriority,
): "default" | "warning" | "danger" {
  if (priority === TaskPriority.URGENT) return "danger";
  if (priority === TaskPriority.HIGH) return "warning";
  return "default";
}

export function linkedRecordTypeLabel(type: TaskLinkedRecordType | string | null | undefined) {
  if (!type) return null;
  return LINKED_RECORD_LABELS[type as TaskLinkedRecordType] ?? type;
}
