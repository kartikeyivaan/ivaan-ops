import { TaskLinkedRecordType, type PrismaClient } from "@prisma/client";
import {
  DISPATCH_CANCEL_REVOKE_TRIGGERS,
  markDcrRevokedAfterDcCancel,
  markInvoiceCancelledAfterDcRevoke,
} from "@/lib/dispatch-cancel-revoke-service";
import type { TaskActorContext } from "@/lib/task-service";

type CompletedTask = {
  id: string;
  companyId: string | null;
  systemTriggerKey: string | null;
  linkedRecordType: TaskLinkedRecordType | null;
  linkedRecordId: string | null;
};

export async function applyTaskCompletionSideEffects(
  client: PrismaClient,
  task: CompletedTask,
  actor: TaskActorContext,
  completionNote?: string | null,
) {
  if (!task.systemTriggerKey || !task.linkedRecordId || !task.companyId) return;

  if (
    task.systemTriggerKey === DISPATCH_CANCEL_REVOKE_TRIGGERS.INVOICE &&
    task.linkedRecordType === TaskLinkedRecordType.INVOICE
  ) {
    await markInvoiceCancelledAfterDcRevoke(client, {
      companyId: task.companyId,
      handoverId: task.linkedRecordId,
      actorUserId: actor.id,
      note: completionNote,
    });
    return;
  }

  if (
    task.systemTriggerKey === DISPATCH_CANCEL_REVOKE_TRIGGERS.DCR &&
    task.linkedRecordType === TaskLinkedRecordType.DOCUMENTATION
  ) {
    await markDcrRevokedAfterDcCancel(client, {
      companyId: task.companyId,
      documentationId: task.linkedRecordId,
      actorUserId: actor.id,
      note: completionNote,
    });
  }
}
