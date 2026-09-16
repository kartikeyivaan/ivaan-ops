import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { listTaskActivity } from "@/lib/task-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  try {
    const { id } = await context.params;
    const activity = await listTaskActivity(prisma, taskActorFromSession(session), id);
    return NextResponse.json(activity);
  } catch (error) {
    return mapTaskError(error);
  }
}
