import { TaskStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getTaskDueAt, isTaskDueToday, isTaskOverdue } from "@/lib/task-overdue";

describe("task overdue logic", () => {
  it("treats a date-only due date as the end of the IST business day", () => {
    const dueAt = getTaskDueAt("2026-09-13");
    expect(dueAt.toISOString()).toBe("2026-09-13T18:29:59.999Z");
  });

  it("uses the optional due time in IST", () => {
    const dueAt = getTaskDueAt("2026-09-13", "10:00");
    expect(dueAt.toISOString()).toBe("2026-09-13T04:30:00.000Z");
  });

  it("does not mark completed, cancelled, or rejected tasks overdue", () => {
    const asOf = new Date("2026-09-14T00:00:00.000Z");
    for (const status of [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED]) {
      expect(isTaskOverdue({ dueDate: "2026-09-01", status }, asOf)).toBe(false);
    }
  });

  it("marks an open past-due task overdue without changing its status", () => {
    const asOf = new Date("2026-09-14T00:00:00.000Z");
    expect(
      isTaskOverdue({ dueDate: "2026-09-12", status: TaskStatus.IN_PROGRESS }, asOf),
    ).toBe(true);
  });

  it("identifies due-today from the business date", () => {
    const asOf = new Date("2026-09-13T08:00:00.000+05:30");
    expect(isTaskDueToday({ dueDate: "2026-09-13", status: TaskStatus.ACKNOWLEDGED }, asOf)).toBe(true);
    expect(isTaskDueToday({ dueDate: "2026-09-12", status: TaskStatus.ACKNOWLEDGED }, asOf)).toBe(false);
  });
});
