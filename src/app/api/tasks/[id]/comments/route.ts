import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { addTaskComment, getTaskDetail } from "@/lib/task-service";
import { addTaskCommentSchema } from "@/lib/task-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  try {
    const { id } = await context.params;
    const task = await getTaskDetail(prisma, taskActorFromSession(session), id);
    return NextResponse.json(task.comments);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const parsed = addTaskCommentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "Comment cannot be empty.", 400, parsed.error.flatten());
  }

  try {
    const { id } = await context.params;
    const comment = await addTaskComment(
      prisma,
      taskActorFromSession(session),
      id,
      parsed.data.comment,
    );
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return mapTaskError(error);
  }
}
