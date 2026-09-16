import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskActorFromSession, taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { getAttentionSummary } from "@/lib/task-service";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const summary = await getAttentionSummary(prisma, taskActorFromSession(session));
  return NextResponse.json(summary);
}
