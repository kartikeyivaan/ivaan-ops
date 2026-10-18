import {
  AutomationDeviceStatus,
  AutomationExecutionEventType,
  AutomationExecutionStatus,
  AutomationPortalAttemptStatus,
  AutomationQueueItemStatus,
  DocumentationStatus,
  DcrPortalStrategy,
  DcrPortalTarget,
  InvoiceHandoverStatus,
  PiCreditStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import {
  isAutomationQueueEligibleLine,
  nextPortalAfterFailure,
  portalAttemptOrder,
  type DcrPortalStrategy as DcrPortalStrategyConst,
} from "@/lib/dcr-documentation-eligibility";
import { dispatchEligibleForDownstreamWhere } from "@/lib/dispatch-workflow-eligibility";

const RUNNABLE_QUEUE_STATUSES: AutomationQueueItemStatus[] = [
  AutomationQueueItemStatus.READY,
  AutomationQueueItemStatus.FAILED,
  AutomationQueueItemStatus.REQUIRES_MANUAL,
];

const queueInclude = {
  dispatch: {
    select: {
      dcNo: true,
      dispatchDate: true,
      proformaInvoice: { select: { piNo: true, creditStatus: true } },
    },
  },
  dispatchLine: {
    select: {
      id: true,
      qty: true,
      product: { select: { displayName: true } },
      serials: { select: { serial: { select: { serialNumber: true } } } },
    },
  },
  documentationRecord: {
    select: {
      status: true,
      invoiceHandover: { select: { status: true, invoiceNumber: true, invoiceDate: true } },
    },
  },
  company: { select: { id: true, code: true, name: true } },
} satisfies Prisma.AutomationQueueItemInclude;

export type AutomationQueueListFilters = {
  companyIds: string[];
  includeEarlyDcr?: boolean;
  statuses?: AutomationQueueItemStatus[];
};

function invoiceRecordedFromHandover(status: InvoiceHandoverStatus): boolean {
  return status === InvoiceHandoverStatus.INVOICE_RECORDED;
}

type QueueEligibilityRow = {
  dispatchLine: { product: { displayName: string } };
  documentationRecord: {
    status: DocumentationStatus;
    invoiceHandover: { status: InvoiceHandoverStatus };
  };
  dispatch: { proformaInvoice: { creditStatus: PiCreditStatus } };
};

function queueLineEligibilityInput(row: QueueEligibilityRow, includeEarlyDcr: boolean) {
  return {
    productDisplayName: row.dispatchLine.product.displayName,
    documentationStatus: row.documentationRecord.status,
    creditStatus: row.dispatch.proformaInvoice.creditStatus,
    invoiceRecorded: invoiceRecordedFromHandover(row.documentationRecord.invoiceHandover.status),
    includeEarlyDcr,
  };
}

const pendingAttemptInclude = {
  queueItem: {
    include: {
      dispatchLine: {
        select: {
          qty: true,
          product: { select: { displayName: true } },
          serials: { select: { serial: { select: { serialNumber: true } } } },
        },
      },
      dispatch: {
        select: {
          dcNo: true,
          dispatchDate: true,
          proformaInvoice: { select: { piNo: true } },
          customer: { select: { customerName: true, gstNumber: true } },
        },
      },
    },
  },
} satisfies Prisma.AutomationPortalAttemptInclude;

export async function syncAutomationQueueForCompanies(
  prisma: PrismaClient,
  companyIds: string[],
): Promise<{ created: number; examined: number }> {
  if (!companyIds.length) return { created: 0, examined: 0 };

  const docs = await prisma.documentationRecord.findMany({
    where: {
      companyId: { in: companyIds },
      status: DocumentationStatus.PENDING,
      dispatch: dispatchEligibleForDownstreamWhere,
    },
    include: {
      invoiceHandover: { select: { status: true } },
      dispatch: {
        select: {
          id: true,
          companyId: true,
          lines: {
            select: {
              id: true,
              product: { select: { displayName: true } },
            },
          },
          proformaInvoice: { select: { creditStatus: true } },
        },
      },
    },
  });

  const toCreate: Prisma.AutomationQueueItemCreateManyInput[] = [];
  let examined = 0;

  for (const doc of docs) {
    const creditStatus = doc.dispatch.proformaInvoice.creditStatus;
    const invoiceRecorded = invoiceRecordedFromHandover(doc.invoiceHandover.status);

    for (const line of doc.dispatch.lines) {
      examined += 1;
      if (
        !isAutomationQueueEligibleLine({
          productDisplayName: line.product.displayName,
          documentationStatus: doc.status,
          creditStatus,
          invoiceRecorded,
          includeEarlyDcr: true,
        })
      ) {
        continue;
      }

      toCreate.push({
        companyId: doc.companyId,
        dispatchId: doc.dispatch.id,
        dispatchLineId: line.id,
        documentationRecordId: doc.id,
        status: AutomationQueueItemStatus.READY,
      });
    }
  }

  if (!toCreate.length) return { created: 0, examined };

  const existing = await prisma.automationQueueItem.findMany({
    where: { dispatchLineId: { in: toCreate.map((row) => row.dispatchLineId) } },
    select: { dispatchLineId: true },
  });
  const existingLineIds = new Set(existing.map((row) => row.dispatchLineId));
  const missing = toCreate.filter((row) => !existingLineIds.has(row.dispatchLineId));
  if (missing.length) {
    await prisma.automationQueueItem.createMany({ data: missing, skipDuplicates: true });
  }

  return { created: missing.length, examined };
}

export async function listAutomationQueue(
  prisma: PrismaClient,
  filters: AutomationQueueListFilters,
) {
  const includeEarlyDcr = filters.includeEarlyDcr ?? false;
  const rows = await prisma.automationQueueItem.findMany({
    where: {
      companyId: { in: filters.companyIds },
      ...(filters.statuses?.length ? { status: { in: filters.statuses } } : {}),
    },
    include: queueInclude,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return rows.filter((row) => isAutomationQueueEligibleLine(queueLineEligibilityInput(row, includeEarlyDcr)));
}

export async function startAutomationExecution(
  prisma: PrismaClient,
  input: {
    initiatedById: string;
    companyIds: string[];
    portalStrategy: DcrPortalStrategyConst;
    includeEarlyDcr: boolean;
    queueItemIds?: string[];
  },
) {
  if (!input.companyIds.length) throw new Error("COMPANY_IDS_REQUIRED");

  await syncAutomationQueueForCompanies(prisma, input.companyIds);

  const strategy = input.portalStrategy as DcrPortalStrategy;
  const portals = portalAttemptOrder(input.portalStrategy);
  const firstPortal = portals[0];
  if (!firstPortal) throw new Error("INVALID_PORTAL_STRATEGY");

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.automationQueueItem.findMany({
      where: {
        companyId: { in: input.companyIds },
        status: { in: RUNNABLE_QUEUE_STATUSES },
        ...(input.queueItemIds?.length ? { id: { in: input.queueItemIds } } : {}),
      },
      include: {
        documentationRecord: {
          select: {
            status: true,
            invoiceHandover: { select: { status: true } },
          },
        },
        dispatchLine: { select: { product: { select: { displayName: true } } } },
        dispatch: { select: { proformaInvoice: { select: { creditStatus: true } } } },
      },
    });

    const items = candidates.filter((row) =>
      isAutomationQueueEligibleLine(queueLineEligibilityInput(row, input.includeEarlyDcr)),
    );

    if (!items.length) throw new Error("NO_RUNNABLE_ITEMS");

    const execution = await tx.automationExecution.create({
      data: {
        portalStrategy: strategy,
        includeEarlyDcr: input.includeEarlyDcr,
        status: AutomationExecutionStatus.QUEUED,
        initiatedById: input.initiatedById,
        progressTotal: items.length,
        progressDone: 0,
        companies: {
          create: input.companyIds.map((companyId) => ({ companyId })),
        },
      },
    });

    const itemIds = items.map((item) => item.id);
    await tx.automationQueueItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        status: AutomationQueueItemStatus.PROCESSING,
        lastExecutionId: execution.id,
        requiresManual: false,
        lastError: null,
      },
    });

    await tx.automationPortalAttempt.createMany({
      data: itemIds.map((queueItemId) => ({
        queueItemId,
        executionId: execution.id,
        portal: firstPortal as DcrPortalTarget,
        sequenceNo: 1,
        status: AutomationPortalAttemptStatus.PENDING,
      })),
    });

    await tx.automationExecutionEvent.create({
      data: {
        executionId: execution.id,
        eventType: AutomationExecutionEventType.INFO,
        message: `Execution queued for ${items.length} line(s). First portal: ${firstPortal}.`,
        metadata: {
          portalStrategy: input.portalStrategy,
          includeEarlyDcr: input.includeEarlyDcr,
          companyIds: input.companyIds,
        },
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "automation_executions",
      recordId: execution.id,
      action: "CREATE",
      performedBy: input.initiatedById,
      companyId: input.companyIds[0] ?? null,
      reference: input.portalStrategy,
      reason: "DCR automation run started",
      newValue: {
        progressTotal: items.length,
        companyIds: input.companyIds,
        includeEarlyDcr: input.includeEarlyDcr,
      },
    });

    return tx.automationExecution.findUniqueOrThrow({
      where: { id: execution.id },
      include: {
        companies: { include: { company: { select: { id: true, code: true, name: true } } } },
        events: { orderBy: { createdAt: "asc" }, take: 20 },
      },
    });
  });
}

export async function getAutomationExecution(
  prisma: PrismaClient,
  executionId: string,
  options?: { omitScreenshots?: boolean },
) {
  const omitScreenshots = options?.omitScreenshots ?? false;
  return prisma.automationExecution.findUnique({
    where: { id: executionId },
    include: {
      initiatedBy: { select: { id: true, name: true, email: true } },
      device: { select: { id: true, label: true, lastSeenAt: true, agentVersion: true } },
      companies: { include: { company: { select: { id: true, code: true, name: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
      portalAttempts: {
        include: {
          queueItem: {
            include: {
              dispatchLine: { select: { product: { select: { displayName: true } } } },
              dispatch: { select: { dcNo: true, proformaInvoice: { select: { piNo: true } } } },
            },
          },
          ...(omitScreenshots
            ? {}
            : { screenshots: { orderBy: { capturedAt: "desc" as const } } }),
        },
        orderBy: [{ queueItemId: "asc" }, { sequenceNo: "asc" }],
      },
    },
  });
}

export async function cancelAutomationExecution(
  prisma: PrismaClient,
  input: { executionId: string; cancelledById: string; reason?: string },
) {
  return prisma.$transaction(async (tx) => {
    const execution = await tx.automationExecution.findUnique({
      where: { id: input.executionId },
    });
    if (!execution) throw new Error("NOT_FOUND");
    if (
      execution.status === AutomationExecutionStatus.COMPLETED
      || execution.status === AutomationExecutionStatus.CANCELLED
    ) {
      throw new Error("EXECUTION_NOT_CANCELLABLE");
    }

    await tx.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: AutomationExecutionStatus.CANCELLED,
        cancelledById: input.cancelledById,
        cancelledAt: new Date(),
        cancelReason: input.reason?.trim() || null,
        finishedAt: new Date(),
      },
    });

    await tx.automationQueueItem.updateMany({
      where: {
        lastExecutionId: execution.id,
        status: AutomationQueueItemStatus.PROCESSING,
      },
      data: { status: AutomationQueueItemStatus.READY },
    });

    await tx.automationExecutionEvent.create({
      data: {
        executionId: execution.id,
        eventType: AutomationExecutionEventType.INFO,
        message: "Execution cancelled.",
        metadata: { reason: input.reason ?? null },
      },
    });

    return execution.id;
  });
}

export async function recordAgentHeartbeat(
  prisma: PrismaClient,
  input: { deviceId: string; agentVersion?: string },
) {
  return prisma.automationDevice.update({
    where: { id: input.deviceId },
    data: {
      lastSeenAt: new Date(),
      agentVersion: input.agentVersion?.trim() || undefined,
    },
    select: { id: true, lastSeenAt: true, status: true },
  });
}

export async function claimAutomationExecutionForDevice(
  prisma: PrismaClient,
  input: { deviceId: string; userId: string },
) {
  const execution = await prisma.automationExecution.findFirst({
    where: {
      status: { in: [AutomationExecutionStatus.QUEUED, AutomationExecutionStatus.RUNNING] },
      initiatedById: input.userId,
      OR: [{ deviceId: null }, { deviceId: input.deviceId }],
      portalAttempts: { some: { status: AutomationPortalAttemptStatus.PENDING } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      deviceId: true,
      startedAt: true,
      portalStrategy: true,
      includeEarlyDcr: true,
      progressDone: true,
      progressTotal: true,
      status: true,
    },
  });

  if (!execution) return null;
  if (execution.deviceId && execution.deviceId !== input.deviceId) return null;

  const full = await prisma.automationExecution.update({
    where: { id: execution.id },
    data: {
      deviceId: input.deviceId,
      status: AutomationExecutionStatus.RUNNING,
      startedAt: execution.startedAt ?? new Date(),
    },
    select: {
      id: true,
      status: true,
      portalStrategy: true,
      includeEarlyDcr: true,
      progressDone: true,
      progressTotal: true,
      startedAt: true,
    },
  });

  return { execution: full, attempts: [] };
}

export async function listPendingAttemptsForAgentExecution(
  prisma: PrismaClient,
  input: { executionId: string; deviceId: string },
) {
  const execution = await prisma.automationExecution.findUnique({
    where: { id: input.executionId },
    select: { deviceId: true, status: true },
  });
  if (!execution || execution.deviceId !== input.deviceId) throw new Error("NOT_FOUND");
  if (
    execution.status !== AutomationExecutionStatus.QUEUED
    && execution.status !== AutomationExecutionStatus.RUNNING
    && execution.status !== AutomationExecutionStatus.AWAITING_LOGIN
  ) {
    return [];
  }

  return prisma.automationPortalAttempt.findMany({
    where: {
      executionId: input.executionId,
      status: AutomationPortalAttemptStatus.PENDING,
    },
    include: pendingAttemptInclude,
    orderBy: { createdAt: "asc" },
  });
}

export type PortalAttemptResultInput = {
  status: "SUCCEEDED" | "FAILED";
  externalDcrNumber?: string;
  externalPortalStatus?: string;
  errorMessage?: string;
  workflowStep?: string;
  screenshotUrl?: string;
  screenshotFileName?: string;
};

export async function completePortalAttempt(
  prisma: PrismaClient,
  input: { attemptId: string; deviceId: string; result: PortalAttemptResultInput },
) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.automationPortalAttempt.findUnique({
      where: { id: input.attemptId },
      include: {
        execution: true,
        queueItem: true,
      },
    });
    if (!attempt) throw new Error("NOT_FOUND");
    if (attempt.execution.deviceId && attempt.execution.deviceId !== input.deviceId) {
      throw new Error("DEVICE_MISMATCH");
    }

    const now = new Date();
    const succeeded = input.result.status === "SUCCEEDED";

    await tx.automationPortalAttempt.update({
      where: { id: attempt.id },
      data: {
        status: succeeded
          ? AutomationPortalAttemptStatus.SUCCEEDED
          : AutomationPortalAttemptStatus.FAILED,
        externalDcrNumber: input.result.externalDcrNumber?.trim() || null,
        errorMessage: input.result.errorMessage?.trim() || null,
        workflowStep: input.result.workflowStep?.trim() || null,
        startedAt: attempt.startedAt ?? now,
        completedAt: now,
      },
    });

    if (input.result.screenshotUrl?.trim()) {
      await tx.automationScreenshot.create({
        data: {
          portalAttemptId: attempt.id,
          storageUrl: input.result.screenshotUrl.trim(),
          fileName: input.result.screenshotFileName?.trim() || null,
        },
      });
    }

    const strategy = attempt.execution.portalStrategy as DcrPortalStrategyConst;
    let progressDelta = 0;

    if (succeeded) {
      await tx.automationQueueItem.update({
        where: { id: attempt.queueItemId },
        data: {
          status: AutomationQueueItemStatus.DCR_ISSUED,
          externalDcrNumber: input.result.externalDcrNumber?.trim() || null,
          externalDcrIssuedAt: now,
          externalPortalStatus: input.result.externalPortalStatus?.trim() || null,
          lastPortal: attempt.portal,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          lastError: null,
          requiresManual: false,
        },
      });
      progressDelta = 1;
    } else {
      const priorAttempts = await tx.automationPortalAttempt.findMany({
        where: {
          queueItemId: attempt.queueItemId,
          executionId: attempt.executionId,
          status: { in: [AutomationPortalAttemptStatus.FAILED, AutomationPortalAttemptStatus.SUCCEEDED] },
        },
        select: { portal: true },
      });
      const triedPortals = priorAttempts.map((a) => a.portal);
      const nextPortal = nextPortalAfterFailure(strategy, triedPortals);

      if (nextPortal) {
        const nextSequence =
          (await tx.automationPortalAttempt.count({
            where: {
              queueItemId: attempt.queueItemId,
              executionId: attempt.executionId,
              portal: nextPortal as DcrPortalTarget,
            },
          })) + 1;
        await tx.automationPortalAttempt.create({
          data: {
            queueItemId: attempt.queueItemId,
            executionId: attempt.executionId,
            portal: nextPortal as DcrPortalTarget,
            sequenceNo: nextSequence,
            status: AutomationPortalAttemptStatus.PENDING,
          },
        });
        await tx.automationQueueItem.update({
          where: { id: attempt.queueItemId },
          data: {
            status: AutomationQueueItemStatus.PROCESSING,
            lastPortal: attempt.portal,
            lastAttemptAt: now,
            attemptCount: { increment: 1 },
            lastError: input.result.errorMessage?.trim() || "Portal attempt failed",
          },
        });
        await tx.automationExecutionEvent.create({
          data: {
            executionId: attempt.executionId,
            portalAttemptId: attempt.id,
            eventType: AutomationExecutionEventType.PORTAL_SWITCH,
            message: `Retry on ${nextPortal} portal.`,
          },
        });
      } else {
        await tx.automationQueueItem.update({
          where: { id: attempt.queueItemId },
          data: {
            status: AutomationQueueItemStatus.REQUIRES_MANUAL,
            requiresManual: true,
            lastPortal: attempt.portal,
            lastAttemptAt: now,
            attemptCount: { increment: 1 },
            lastError: input.result.errorMessage?.trim() || "All portal attempts failed",
          },
        });
        progressDelta = 1;
      }
    }

    await tx.automationExecution.update({
      where: { id: attempt.executionId },
      data: {
        progressDone: { increment: progressDelta },
      },
    });

    const openItems = await tx.automationQueueItem.count({
      where: {
        lastExecutionId: attempt.executionId,
        status: AutomationQueueItemStatus.PROCESSING,
      },
    });

    const pendingAttempts = await tx.automationPortalAttempt.count({
      where: {
        executionId: attempt.executionId,
        status: AutomationPortalAttemptStatus.PENDING,
      },
    });

    if (openItems === 0 && pendingAttempts === 0) {
      await tx.automationExecution.update({
        where: { id: attempt.executionId },
        data: {
          status: AutomationExecutionStatus.COMPLETED,
          finishedAt: now,
        },
      });
    }

    await tx.automationExecutionEvent.create({
      data: {
        executionId: attempt.executionId,
        portalAttemptId: attempt.id,
        eventType: succeeded ? AutomationExecutionEventType.STEP : AutomationExecutionEventType.ERROR,
        message: succeeded
          ? `DCR issued on ${attempt.portal}.`
          : input.result.errorMessage?.trim() || "Attempt failed.",
      },
    });

    return { queueItemId: attempt.queueItemId, executionId: attempt.executionId };
  });
}

export async function listRecentAutomationExecutions(
  prisma: PrismaClient,
  input: { companyIds: string[]; limit?: number },
) {
  const limit = input.limit ?? 20;
  return prisma.automationExecution.findMany({
    where: {
      companies: { some: { companyId: { in: input.companyIds } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      initiatedBy: { select: { id: true, name: true } },
      device: { select: { id: true, label: true, lastSeenAt: true } },
      companies: { include: { company: { select: { code: true, name: true } } } },
    },
  });
}

export async function getAutomationAgentStatusForUser(prisma: PrismaClient, userId: string) {
  const devices = await prisma.automationDevice.findMany({
    where: { userId, status: AutomationDeviceStatus.ACTIVE },
    orderBy: { lastSeenAt: "desc" },
    take: 5,
    select: {
      id: true,
      label: true,
      lastSeenAt: true,
      agentVersion: true,
    },
  });
  const onlineThresholdMs = 90_000;
  const now = Date.now();
  const connected = devices.some(
    (d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < onlineThresholdMs,
  );
  return { connected, devices };
}
