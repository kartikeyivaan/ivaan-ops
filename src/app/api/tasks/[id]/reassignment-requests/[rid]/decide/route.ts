import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { decideReassignment } from "@/lib/task-service";
import { decideReassignmentSchema } from "@/lib/task-validations";

type RouteContext = { params: Promise<{ id: string; rid: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const parsed = decideReassignmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "Invalid decision.", 400, parsed.error.flatten());
  }

  try {
    const { id, rid } = await context.params;
    const task = await decideReassignment(
      prisma,
      taskActorFromSession(session),
      id,
      rid,
      parsed.data.decision,
      parsed.data.assignedToId,
      parsed.data.note,
    );
    return NextResponse.json(task);
  } catch (error) {
    return mapTaskError(error);
  }
}
