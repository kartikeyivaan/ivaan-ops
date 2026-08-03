"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import type { LearningLocale } from "@/lib/learning/lessons";
import { getLessonByHref, LEARNING_UI } from "@/lib/learning/lessons";

const LOCALE_KEY = "ivaan-learn-locale";

type LearningContextValue = {
  locale: LearningLocale;
  setLocale: (locale: LearningLocale) => void;
  t: (value: { en: string; hi: string }) => string;
  learningMode: boolean;
  entering: boolean;
  exiting: boolean;
  enterLearningMode: () => Promise<void>;
  exitLearningMode: () => Promise<void>;
  activeTourLessonId: string | null;
  startTourForCurrentPage: () => void;
  startTour: (lessonId: string, href?: string) => void;
  stopTour: () => void;
  refreshProgress: () => Promise<void>;
  completedIds: Set<string>;
  showFirstLoginPrompt: boolean;
  dismissFirstLoginPrompt: (start: boolean) => Promise<void>;
};

const LearningContext = createContext<LearningContextValue | null>(null);

export function LearningProvider({ children }: { children: ReactNode }) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [locale, setLocaleState] = useState<LearningLocale>("en");
  const [entering, setEntering] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [activeTourLessonId, setActiveTourLessonId] = useState<string | null>(
    null,
  );
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [showFirstLoginPrompt, setShowFirstLoginPrompt] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_KEY);
      if (stored === "en" || stored === "hi") setLocaleState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const setLocale = useCallback((next: LearningLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (value: { en: string; hi: string }) => value[locale],
    [locale],
  );

  const refreshProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/learning/progress");
      if (!res.ok) return;
      const data = (await res.json()) as {
        completedIds: string[];
        showFirstLoginPrompt: boolean;
      };
      setCompletedIds(new Set(data.completedIds ?? []));
      setShowFirstLoginPrompt(Boolean(data.showFirstLoginPrompt));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      void refreshProgress();
    }
  }, [session?.user?.id, refreshProgress]);

  const enterLearningMode = useCallback(async () => {
    setEntering(true);
    try {
      const res = await fetch("/api/learning/enter", { method: "POST" });
      if (!res.ok) throw new Error("Failed to enter learning mode");
      const data = (await res.json()) as {
        practiceCompanyId: string;
        returnCompanyId: string | null;
        companies: Array<{
          id: string;
          name: string;
          code: string;
          isPractice?: boolean;
        }>;
      };
      await update({
        companies: data.companies,
        activeCompanyId: data.practiceCompanyId,
        learningMode: true,
        learningReturnCompanyId: data.returnCompanyId,
      });
      await fetch("/api/learning/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissPrompt: true }),
      });
      setShowFirstLoginPrompt(false);
      router.push("/learn");
      router.refresh();
    } finally {
      setEntering(false);
    }
  }, [router, update]);

  const exitLearningMode = useCallback(async () => {
    setExiting(true);
    try {
      const res = await fetch("/api/learning/exit", { method: "POST" });
      if (!res.ok) throw new Error("Failed to exit learning mode");
      const data = (await res.json()) as {
        companies: Array<{
          id: string;
          name: string;
          code: string;
          isPractice?: boolean;
        }>;
        activeCompanyId: string | null;
      };
      setActiveTourLessonId(null);
      await update({
        companies: data.companies,
        activeCompanyId: data.activeCompanyId,
        learningMode: false,
        learningReturnCompanyId: null,
      });
      router.push("/dashboard");
      router.refresh();
    } finally {
      setExiting(false);
    }
  }, [router, update]);

  const startTour = useCallback(
    (lessonId: string, href?: string) => {
      setActiveTourLessonId(lessonId);
      if (href && pathname !== href && !pathname.startsWith(`${href}/`)) {
        router.push(href);
      }
    },
    [pathname, router],
  );

  const startTourForCurrentPage = useCallback(() => {
    const lesson = getLessonByHref(pathname);
    if (lesson) setActiveTourLessonId(lesson.id);
  }, [pathname]);

  const stopTour = useCallback(() => {
    setActiveTourLessonId(null);
  }, []);

  const dismissFirstLoginPrompt = useCallback(
    async (start: boolean) => {
      await fetch("/api/learning/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissPrompt: true }),
      });
      setShowFirstLoginPrompt(false);
      if (start) await enterLearningMode();
    },
    [enterLearningMode],
  );

  const value = useMemo<LearningContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      learningMode: Boolean(session?.user?.learningMode),
      entering,
      exiting,
      enterLearningMode,
      exitLearningMode,
      activeTourLessonId,
      startTourForCurrentPage,
      startTour,
      stopTour,
      refreshProgress,
      completedIds,
      showFirstLoginPrompt,
      dismissFirstLoginPrompt,
    }),
    [
      locale,
      setLocale,
      t,
      session?.user?.learningMode,
      entering,
      exiting,
      enterLearningMode,
      exitLearningMode,
      activeTourLessonId,
      startTourForCurrentPage,
      startTour,
      stopTour,
      refreshProgress,
      completedIds,
      showFirstLoginPrompt,
      dismissFirstLoginPrompt,
    ],
  );

  return (
    <LearningContext.Provider value={value}>{children}</LearningContext.Provider>
  );
}

export function useLearning() {
  const ctx = useContext(LearningContext);
  if (!ctx) {
    throw new Error("useLearning must be used within LearningProvider");
  }
  return ctx;
}

export function useLearningOptional() {
  return useContext(LearningContext);
}

export { LEARNING_UI };
