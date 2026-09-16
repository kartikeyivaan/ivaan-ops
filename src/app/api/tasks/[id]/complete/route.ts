import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { completeTask } from "@/lib/task-service";
import { completeTaskSchema } from "@/lib/task-validations";

type RouteContext = { params: Promise<{ id: string }> };

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
    const task = await completeTask(prisma, taskActorFromSession(session), id, parsed.data.note);
    return NextResponse.json(task);
  } catch (error) {
    return mapTaskError(error);
  }
}
