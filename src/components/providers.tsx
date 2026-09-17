"use client";

import { SessionProvider } from "next-auth/react";
import { LearningProvider } from "@/components/learning/learning-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={20 * 60} refetchOnWindowFocus={false}>
      <LearningProvider>{children}</LearningProvider>
    </SessionProvider>
  );
}
