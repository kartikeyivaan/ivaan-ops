import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { applyTaskCompletionSideEffects } from "@/lib/task-completion-side-effects";
import { canCompleteTask, canUseTasks } from "@/lib/task-permissions";
import { completeTask } from "@/lib/task-service";
import { completeTaskSchema } from "@/lib/task-validations";

type RouteContext = { params: Promise<{ id: string }> };

const REVOKE_SIDE_EFFECT_ERRORS: Record<string, string> = {
  NOT_FOUND: "Linked invoice or documentation record was not found.",
  DISPATCH_NOT_CANCELLED: "The delivery challan is not cancelled.",
  INVALID_HANDOVER_STATUS: "Invoice handover is not in a state that can be marked cancelled.",
  INVALID_DOCUMENTATION_STATUS: "Documentation is not in DCR issued status.",
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = completeTaskSchema.safeParse(body);
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "Invalid completion data.", 400, parsed.error.flatten());
  }

  try {
    const { id } = await context.params;
    const actor = taskActorFromSession(session);
    const pending = await prisma.task.findUnique({ where: { id } });
    if (!pending) {
      return taskError("NOT_FOUND", "Task not found.", 404);
    }
    if (!canCompleteTask(pending, actor)) {
      return taskError("INVALID_TRANSITION", "You cannot complete this task.", 400);
    }

    await applyTaskCompletionSideEffects(prisma, pending, actor, parsed.data.note);
    const task = await completeTask(prisma, actor, id, parsed.data.note);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && REVOKE_SIDE_EFFECT_ERRORS[error.message]) {
      return taskError("REVOKE_FAILED", REVOKE_SIDE_EFFECT_ERRORS[error.message], 400);
    }
    return mapTaskError(error);
  }
}
