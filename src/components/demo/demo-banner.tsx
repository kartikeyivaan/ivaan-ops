"use client";

import { useSession } from "next-auth/react";
import { FlaskConical } from "lucide-react";
import { DEMO_COMPANY_RECORD_LABEL, isDemoCompany } from "@/lib/demo-mode";

export function DemoBanner() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  const active =
    (session.user.companies ?? []).find(
      (c) => c.id === session.user.activeCompanyId,
    ) ?? null;
  const show = Boolean(session.user.isDemo) || isDemoCompany(active);
  if (!show) return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 text-sm text-sky-950 sm:px-6">
        <FlaskConical className="h-4 w-4 shrink-0" />
        <p className="min-w-0">
          {DEMO_COMPANY_RECORD_LABEL} — sample data only. Changes stay in Ivaan
          Demo and do not affect live ISE / PCMV operations.
        </p>
      </div>
    </div>
  );
}
