"use client";

import { SessionProvider } from "next-auth/react";
import { LearningProvider } from "@/components/learning/learning-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LearningProvider>{children}</LearningProvider>
    </SessionProvider>
  );
}
