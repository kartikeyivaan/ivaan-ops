import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { requestReassignment } from "@/lib/task-service";
import { requestReassignmentSchema } from "@/lib/task-validations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const parsed = requestReassignmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return taskError("VALIDATION_ERROR", "A reason is required.", 400, parsed.error.flatten());
  }

  try {
    const { id } = await context.params;
    const result = await requestReassignment(
      prisma,
      taskActorFromSession(session),
      id,
      parsed.data.reason,
      parsed.data.requestedToId,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return mapTaskError(error);
  }
}
