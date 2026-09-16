import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskError } from "@/lib/task-api";
import { listNotifications, markAllNotificationsRead } from "@/lib/task-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(prisma, session.user.id, unreadOnly),
    prisma.notification.count({ where: { userId: session.user.id, isRead: false } }),
  ]);
  return NextResponse.json({ items: notifications, unreadCount });
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user) {
    return taskError("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  await markAllNotificationsRead(prisma, session.user.id);
  return NextResponse.json({ ok: true });
}
