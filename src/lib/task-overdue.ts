import { TaskStatus } from "@prisma/client";
import { BUSINESS_TIMEZONE, getBusinessToday } from "@/lib/business-dates";

const CLOSED_STATUSES = new Set<TaskStatus>([
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
  TaskStatus.REJECTED,
]);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dueDateString(dueDate: Date | string): string {
  if (typeof dueDate === "string") {
    return dueDate.slice(0, 10);
  }
  return dueDate.toISOString().slice(0, 10);
}

function parseDueTime(dueTime: string | null | undefined): { hour: number; minute: number } | null {
  if (!dueTime) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(dueTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Instant when the task becomes overdue in Asia/Kolkata. */
export function getTaskDueAt(
  dueDate: Date | string,
  dueTime?: string | null,
): Date {
  const dateStr = dueDateString(dueDate);
  const parsedTime = parseDueTime(dueTime);
  if (parsedTime) {
    return new Date(
      `${dateStr}T${pad2(parsedTime.hour)}:${pad2(parsedTime.minute)}:00.000+05:30`,
    );
  }
  return new Date(`${dateStr}T23:59:59.999+05:30`);
}

export function isClosedTaskStatus(status: TaskStatus): boolean {
  return CLOSED_STATUSES.has(status);
}

export function isTaskOverdue(
  task: { dueDate?: Date | string | null; dueTime?: string | null; status: TaskStatus },
  asOf = new Date(),
): boolean {
  if (!task.dueDate || isClosedTaskStatus(task.status)) return false;
  return asOf.getTime() > getTaskDueAt(task.dueDate, task.dueTime).getTime();
}

export function isTaskDueToday(
  task: { dueDate?: Date | string | null; status: TaskStatus },
  asOf = new Date(),
): boolean {
  if (!task.dueDate || isClosedTaskStatus(task.status)) return false;
  return dueDateString(task.dueDate) === getBusinessToday(asOf);
}

export function formatTaskDueLabel(
  dueDate?: Date | string | null,
  dueTime?: string | null,
): string | null {
  if (!dueDate) return null;
  const dateStr = dueDateString(dueDate);
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const parsedTime = parseDueTime(dueTime);
  if (!parsedTime) return dateLabel;
  return `${dateLabel} ${pad2(parsedTime.hour)}:${pad2(parsedTime.minute)}`;
}

export { BUSINESS_TIMEZONE, CLOSED_STATUSES };
