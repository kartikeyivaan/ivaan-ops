"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import {
  LEARNING_UI,
  lessonsForRoles,
  type LessonDefinition,
} from "@/lib/learning/lessons";
import {
  useLearning,
} from "@/components/learning/learning-provider";
import { useSession } from "next-auth/react";

export function LearnChecklistPage() {
  const { data: session } = useSession();
  const {
    t,
    locale,
    learningMode,
    enterLearningMode,
    entering,
    completedIds,
    startTour,
  } = useLearning();

  const roles = session?.user?.roles ?? [];
  const lessons = lessonsForRoles(roles);
  const done = lessons.filter((l) => completedIds.has(l.id)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t(LEARNING_UI.learnTitle)}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t(LEARNING_UI.actionHint)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-800">
          {t(LEARNING_UI.progressLabel)}: {done}/{lessons.length}
        </p>
        <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{
              width: `${lessons.length ? (done / lessons.length) * 100 : 0}%`,
            }}
          />
        </div>
        {!learningMode ? (
          <button
            type="button"
            disabled={entering}
            onClick={() => void enterLearningMode()}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {entering ? "…" : t(LEARNING_UI.start)}
          </button>
        ) : (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
            Learning Mode ON
          </span>
        )}
      </div>

      <ul className="space-y-3">
        {lessons.map((lesson) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            completed={completedIds.has(lesson.id)}
            locale={locale}
            t={t}
            learningMode={learningMode}
            onStartTour={() => startTour(lesson.id, lesson.href)}
          />
        ))}
      </ul>
    </div>
  );
}

function LessonRow({
  lesson,
  completed,
  locale,
  t,
  learningMode,
  onStartTour,
}: {
  lesson: LessonDefinition;
  completed: boolean;
  locale: "en" | "hi";
  t: (v: { en: string; hi: string }) => string;
  learningMode: boolean;
  onStartTour: () => void;
}) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {completed ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{lesson.title[locale]}</p>
            <p className="mt-0.5 text-sm text-slate-500">{lesson.goal[locale]}</p>
            <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-sm text-slate-600">
              {lesson.steps[locale].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {lesson.watchOuts[locale].length ? (
              <p className="mt-2 text-xs text-amber-800">
                {lesson.watchOuts[locale].join(" ")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              completed
                ? "bg-emerald-50 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {completed ? t(LEARNING_UI.completed) : t(LEARNING_UI.pending)}
          </span>
          <Link
            href={lesson.href}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Open
          </Link>
          {learningMode ? (
            <button
              type="button"
              onClick={onStartTour}
              className="text-sm text-slate-600 hover:underline"
            >
              {t(LEARNING_UI.startTour)}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
