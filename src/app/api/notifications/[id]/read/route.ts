import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapTaskError, taskError } from "@/lib/task-api";
import { markNotificationRead } from "@/lib/task-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  try {
    const { id } = await context.params;
    const notification = await markNotificationRead(prisma, session.user.id, id);
    return NextResponse.json(notification);
  } catch (error) {
    return mapTaskError(error);
  }
}
