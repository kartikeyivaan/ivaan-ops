import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskError } from "@/lib/task-api";
import { canUseTasks } from "@/lib/task-permissions";
import { listTaskAssignees } from "@/lib/task-service";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canUseTasks(session.user.roles)) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const users = await listTaskAssignees(prisma);
  return NextResponse.json(
    users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles.map((entry) => entry.role.name),
    })),
  );
}
