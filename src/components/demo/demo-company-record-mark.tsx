"use client";

import { useSession } from "next-auth/react";
import { FlaskConical } from "lucide-react";
import {
  DEMO_COMPANY_RECORD_LABEL,
  isDemoCompany,
  type DemoCompanyFields,
} from "@/lib/demo-mode";
import { cn } from "@/lib/utils";

export function DemoCompanyRecordMark({
  company,
  className,
  compact = false,
}: {
  company?: DemoCompanyFields | null;
  className?: string;
  compact?: boolean;
}) {
  const { data: session } = useSession();
  const active =
    (session?.user?.companies ?? []).find(
      (c) => c.id === session?.user?.activeCompanyId,
    ) ?? null;
  const show =
    isDemoCompany(company) ||
    Boolean(session?.user?.isDemo) ||
    isDemoCompany(active);
  if (!show) return null;

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900",
          className,
        )}
      >
        {DEMO_COMPANY_RECORD_LABEL}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950",
        className,
      )}
      role="status"
    >
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>{DEMO_COMPANY_RECORD_LABEL}</span>
    </div>
  );
}
