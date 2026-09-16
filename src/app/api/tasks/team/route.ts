import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canViewTeamTasks } from "@/lib/task-permissions";
import { getTeamTaskCounts, listTeamTasks } from "@/lib/task-service";
import { taskListQuerySchema } from "@/lib/task-validations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewTeamTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const parsed = taskListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  try {
    const actor = taskActorFromSession(session);
    const [result, counts] = await Promise.all([
      listTeamTasks(prisma, actor, parsed.data),
      getTeamTaskCounts(prisma, actor),
    ]);
    return NextResponse.json({ ...result, counts });
  } catch (error) {
    return mapTaskError(error);
  }
}
