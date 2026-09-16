import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { getTodoCounts, listMyTodo } from "@/lib/task-service";
import { taskListQuerySchema } from "@/lib/task-validations";

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
    listMyTodo(prisma, actor, parsed.data),
    getTodoCounts(prisma, actor),
  ]);
  return NextResponse.json({ ...result, counts });
}
