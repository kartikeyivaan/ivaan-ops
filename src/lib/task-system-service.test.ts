import { TaskLinkedRecordType, TaskStatus, TaskType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  SYSTEM_TASK_TRIGGERS,
  createSystemTaskIdempotent,
  getSystemTaskRule,
  systemTaskDedupWhere,
} from "@/lib/task-system-service";

function mockClient(existing: unknown = null) {
  const client = {
    task: {
      findFirst: vi.fn(async () => existing),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "user-1", name: "Harshal", status: "ACTIVE" })),
    },
    quotation: {
      findUnique: vi.fn(async () => ({
        id: "quote-1",
        quotationNo: "Q-1",
        companyId: "company-1",
      })),
    },
    payment: {
      findUnique: vi.fn(async () => ({
        id: "pay-1",
        referenceNo: "REF-1",
        companyId: "company-1",
        proformaInvoice: { piNo: "PI-1" },
      })),
    },
    taskActivity: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(async (operation: (tx: unknown) => unknown) => operation(client)),
  };
  return client;
}

describe("system task framework", () => {
  it("registers reusable trigger keys without hard-coding the full catalogue", () => {
    expect(getSystemTaskRule(SYSTEM_TASK_TRIGGERS.QUOTATION_FOLLOW_UP)?.sourceType).toBe("QUOTATION");
    expect(getSystemTaskRule(SYSTEM_TASK_TRIGGERS.PAYMENT_FOLLOW_UP)?.sourceType).toBe("PAYMENT");
    expect(getSystemTaskRule(SYSTEM_TASK_TRIGGERS.DCR_PENDING)?.sourceType).toBe("INVOICE");
  });

  it("deduplicates on trigger + source record for active tasks only", () => {
    const where = systemTaskDedupWhere({
      triggerKey: SYSTEM_TASK_TRIGGERS.PAYMENT_FOLLOW_UP,
      sourceType: TaskLinkedRecordType.PAYMENT,
      sourceId: "pay-1",
    });
    expect(where.taskType).toBe(TaskType.SYSTEM);
    expect(where.systemTriggerKey).toBe(SYSTEM_TASK_TRIGGERS.PAYMENT_FOLLOW_UP);
    expect(where.status).toEqual({
      in: [TaskStatus.PENDING_ACKNOWLEDGEMENT, TaskStatus.ACKNOWLEDGED, TaskStatus.IN_PROGRESS],
    });
  });

  it("returns the existing active system task instead of creating a duplicate", async () => {
    const existing = {
      id: "task-1",
      title: "Payment follow-up due",
      taskType: TaskType.SYSTEM,
      status: TaskStatus.PENDING_ACKNOWLEDGEMENT,
      dueDate: new Date("2026-09-01"),
      dueTime: null,
      linkedRecordType: TaskLinkedRecordType.PAYMENT,
      linkedRecordId: "pay-1",
      createdBy: null,
      assignedTo: { id: "user-1", name: "Harshal" },
      acknowledgedBy: null,
      completedBy: null,
      cancelledBy: null,
      company: null,
    };
    const client = mockClient(existing);
    const result = await createSystemTaskIdempotent(client as never, {
      triggerKey: SYSTEM_TASK_TRIGGERS.PAYMENT_FOLLOW_UP,
      sourceType: TaskLinkedRecordType.PAYMENT,
      sourceId: "pay-1",
      assignedToId: "user-1",
      dueDate: "2026-09-20",
    });

    expect(result.created).toBe(false);
    expect(result.task.id).toBe("task-1");
    expect(client.task.create).not.toHaveBeenCalled();
  });
});
