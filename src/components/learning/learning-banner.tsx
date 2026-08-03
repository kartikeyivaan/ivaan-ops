"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import {
  LEARNING_UI,
  useLearning,
} from "@/components/learning/learning-provider";

export function LearningBanner() {
  const { learningMode, exitLearningMode, exiting, t, startTourForCurrentPage } =
    useLearning();

  if (!learningMode) return null;

  return (
    <div
      data-tour="learning-banner"
      className="border-b border-amber-200 bg-amber-50"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-2 text-sm text-amber-950">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0">{t(LEARNING_UI.banner)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/learn"
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            {t(LEARNING_UI.openChecklist)}
          </Link>
          <button
            type="button"
            onClick={startTourForCurrentPage}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            {t(LEARNING_UI.startTour)}
          </button>
          <button
            type="button"
            disabled={exiting}
            onClick={() => void exitLearningMode()}
            className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {exiting ? "…" : t(LEARNING_UI.exit)}
          </button>
        </div>
      </div>
    </div>
  );
}
