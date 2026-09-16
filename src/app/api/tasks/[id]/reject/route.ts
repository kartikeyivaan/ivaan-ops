import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { rejectTask } from "@/lib/task-service";
import { rejectTaskSchema } from "@/lib/task-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const parsed = rejectTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "A rejection reason is required.", 400, parsed.error.flatten());
  }

  try {
    const { id } = await context.params;
    const task = await rejectTask(prisma, taskActorFromSession(session), id, parsed.data.reason);
    return NextResponse.json(task);
  } catch (error) {
    return mapTaskError(error);
  }
}
