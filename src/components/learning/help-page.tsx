"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  LEARNING_UI,
  lessonsForRoles,
  type LessonDefinition,
} from "@/lib/learning/lessons";
import { useLearning } from "@/components/learning/learning-provider";

export function HelpPage() {
  const { data: session } = useSession();
  const {
    t,
    locale,
    setLocale,
    learningMode,
    enterLearningMode,
    entering,
    completedIds,
  } = useLearning();
  const [query, setQuery] = useState("");

  const lessons = useMemo(() => {
    const all = lessonsForRoles(session?.user?.roles ?? []);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((lesson) => {
      const blob = [
        lesson.title.en,
        lesson.title.hi,
        lesson.goal.en,
        lesson.goal.hi,
        ...lesson.steps.en,
        ...lesson.steps.hi,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [session?.user?.roles, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t(LEARNING_UI.helpTitle)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t({
              en: "Guides for every section you can access. Start Learning Mode for checklist and tours on the Practice company.",
              hi: "आपके उपलब्ध प्रत्येक सेक्शन के लिए गाइड। Practice कंपनी पर चेकलिस्ट और टूर के लिए Learning Mode शुरू करें।",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-500">
            {t(LEARNING_UI.language)}
          </label>
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={locale}
            onChange={(e) => setLocale(e.target.value as "en" | "hi")}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
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
            <Link
              href="/learn"
              className="rounded-md bg-amber-800 px-3 py-2 text-sm font-medium text-white hover:bg-amber-900"
            >
              {t(LEARNING_UI.resume)}
            </Link>
          )}
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t({ en: "Search guides…", hi: "गाइड खोजें…" })}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
      />

      <div className="grid gap-3">
        {lessons.map((lesson) => (
          <HelpArticle
            key={lesson.id}
            lesson={lesson}
            locale={locale}
            completed={completedIds.has(lesson.id)}
            t={t}
          />
        ))}
        {!lessons.length ? (
          <p className="text-sm text-slate-500">
            {t({ en: "No matching guides.", hi: "कोई मेल खाती गाइड नहीं।" })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function HelpArticle({
  lesson,
  locale,
  completed,
  t,
}: {
  lesson: LessonDefinition;
  locale: "en" | "hi";
  completed: boolean;
  t: (v: { en: string; hi: string }) => string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          {lesson.title[locale]}
        </h2>
        <span
          className={`text-xs font-medium ${
            completed ? "text-emerald-700" : "text-slate-400"
          }`}
        >
          {completed ? t(LEARNING_UI.completed) : t(LEARNING_UI.pending)}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">{lesson.goal[locale]}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        {lesson.steps[locale].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {lesson.watchOuts[locale].length ? (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-amber-800">
          {lesson.watchOuts[locale].map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3">
        <Link
          href={lesson.href}
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          {t({ en: "Open section", hi: "सेक्शन खोलें" })}
        </Link>
      </div>
    </article>
  );
}
