import { prisma } from "@/lib/prisma";
import {
  lessonsMatchingEvent,
  type LessonDefinition,
} from "@/lib/learning/lessons";
import { isLearningMode, isPracticeCompany } from "@/lib/learning/mode";
import type { Session } from "next-auth";

export async function recordLearningEvent(
  session: Session | null,
  event: string,
): Promise<string[]> {
  if (!session?.user?.id) return [];
  if (!isLearningMode(session)) return [];

  const active = session.user.companies.find(
    (c) => c.id === session.user.activeCompanyId,
  );
  if (!isPracticeCompany(active)) return [];

  const lessons = lessonsMatchingEvent(event);
  if (!lessons.length) return [];

  const completedIds: string[] = [];
  for (const lesson of lessons) {
    await prisma.learningProgress.upsert({
      where: {
        userId_lessonId: {
          userId: session.user.id,
          lessonId: lesson.id,
        },
      },
      create: {
        userId: session.user.id,
        lessonId: lesson.id,
      },
      update: {},
    });
    completedIds.push(lesson.id);
  }
  return completedIds;
}

export async function completeLesson(
  userId: string,
  lesson: LessonDefinition,
): Promise<void> {
  await prisma.learningProgress.upsert({
    where: {
      userId_lessonId: {
        userId,
        lessonId: lesson.id,
      },
    },
    create: {
      userId,
      lessonId: lesson.id,
    },
    update: {},
  });
}

export async function getCompletedLessonIds(userId: string): Promise<string[]> {
  const rows = await prisma.learningProgress.findMany({
    where: { userId },
    select: { lessonId: true },
  });
  return rows.map((row) => row.lessonId);
}
