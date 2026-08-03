"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getLessonById } from "@/lib/learning/lessons";
import { useLearning } from "@/components/learning/learning-provider";

type Rect = { top: number; left: number; width: number; height: number };

function measure(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function LearningTourOverlay() {
  const {
    activeTourLessonId,
    stopTour,
    t,
    locale,
    learningMode,
    refreshProgress,
  } = useLearning();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [completing, setCompleting] = useState(false);

  const lesson = activeTourLessonId
    ? getLessonById(activeTourLessonId)
    : undefined;
  const steps = lesson?.tour ?? [];
  const step = steps[stepIndex];

  useEffect(() => {
    setStepIndex(0);
  }, [activeTourLessonId]);

  useEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    const update = () => setRect(measure(step.target));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const timer = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(timer);
    };
  }, [step]);

  const pad = 8;
  const spotlight = useMemo(() => {
    if (!rect) return null;
    return {
      top: Math.max(0, rect.top - pad),
      left: Math.max(0, rect.left - pad),
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
  }, [rect]);

  if (!learningMode || !lesson || !step) return null;

  async function finishTour() {
    if (!lesson) return;
    setCompleting(true);
    try {
      if (lesson.completionEvent === "tour.completed") {
        await fetch("/api/learning/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId: lesson.id,
            event: "tour.completed",
          }),
        });
        await refreshProgress();
      }
      stopTour();
    } finally {
      setCompleting(false);
    }
  }

  const tooltipStyle = spotlight
    ? {
        top: Math.min(
          window.innerHeight - 220,
          spotlight.top + spotlight.height + 12,
        ),
        left: Math.min(
          window.innerWidth - 340,
          Math.max(12, spotlight.left),
        ),
      }
    : { top: 96, left: 24 };

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-slate-900/50" />
      {spotlight ? (
        <div
          className="absolute rounded-lg ring-2 ring-amber-300 ring-offset-2 ring-offset-transparent"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      ) : null}

      <div
        className="pointer-events-auto absolute w-[min(100%-24px,320px)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        style={tooltipStyle}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
              {t(lesson.title)} · {stepIndex + 1}/{steps.length}
            </p>
            <h3 className="text-sm font-semibold text-slate-900">
              {step.title[locale]}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close tour"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={stopTour}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-slate-600">{step.body[locale]}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            Back
          </button>
          {stepIndex < steps.length - 1 ? (
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
              onClick={() => setStepIndex((i) => i + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={completing}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
              onClick={() => void finishTour()}
            >
              {completing ? "…" : t({ en: "Done", hi: "समाप्त" })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
