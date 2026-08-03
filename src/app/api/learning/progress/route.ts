import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLessonById } from "@/lib/learning/lessons";
import { lessonsForRoles } from "@/lib/learning/lessons";
import {
  completeLesson,
  getCompletedLessonIds,
} from "@/lib/learning/progress";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  const lessons = lessonsForRoles(session.user.roles);
  const completedIds = await getCompletedLessonIds(session.user.id);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { learningPromptDismissedAt: true },
  });

  return NextResponse.json({
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      href: lesson.href,
      completionEvent: lesson.completionEvent,
      completed: completedIds.includes(lesson.id),
    })),
    completedIds,
    total: lessons.length,
    completedCount: lessons.filter((l) => completedIds.includes(l.id)).length,
    showFirstLoginPrompt: !user?.learningPromptDismissedAt,
    learningMode: Boolean(session.user.learningMode),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    lessonId?: string;
    event?: string;
    dismissPrompt?: boolean;
  } | null;

  if (body?.dismissPrompt) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { learningPromptDismissedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.lessonId) {
    const lesson = getLessonById(body.lessonId);
    if (!lesson) {
      return NextResponse.json(
        { code: "NOT_FOUND", message: "Lesson not found." },
        { status: 404 },
      );
    }

    const accessible = lessonsForRoles(session.user.roles).some(
      (l) => l.id === lesson.id,
    );
    if (!accessible) {
      return NextResponse.json(
        { code: "FORBIDDEN", message: "Lesson not available for your role." },
        { status: 403 },
      );
    }

    // Tour completion only for explore lessons.
    if (
      lesson.completionEvent === "tour.completed" ||
      body.event === "tour.completed"
    ) {
      if (!session.user.learningMode) {
        return NextResponse.json(
          {
            code: "LEARNING_MODE_REQUIRED",
            message: "Start Learning Mode to complete lessons.",
          },
          { status: 400 },
        );
      }
      await completeLesson(session.user.id, lesson);
      return NextResponse.json({ ok: true, lessonId: lesson.id });
    }

    return NextResponse.json(
      {
        code: "ACTION_REQUIRED",
        message:
          "This lesson completes when you finish the practice action in the app.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { code: "VALIDATION_ERROR", message: "Invalid progress payload." },
    { status: 400 },
  );
}
