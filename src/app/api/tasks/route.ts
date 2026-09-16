import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { createUserTask, getMyTaskCounts, listMyTasks } from "@/lib/task-service";
import { createTaskSchema, taskListQuerySchema } from "@/lib/task-validations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const parsed = taskListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const actor = taskActorFromSession(session);
  const [result, counts] = await Promise.all([
    listMyTasks(prisma, actor, parsed.data),
    getMyTaskCounts(prisma, actor),
  ]);
  return NextResponse.json({ ...result, counts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "Invalid task data.", 400, parsed.error.flatten());
  }

  try {
    const created = await createUserTask(prisma, taskActorFromSession(session), {
      ...parsed.data,
      dueTime: parsed.data.dueTime || null,
      description: parsed.data.description || null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapTaskError(error);
  }
}
