"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDashboardUpdatedAt } from "@/components/dashboard/dashboard-formatters";
import { refreshDashboardCache } from "@/app/(app)/dashboard/actions";
import type { DashboardKind } from "@/lib/sales-dashboard/dashboard-types";

type DashboardRefreshControlsProps = {
  kind: DashboardKind;
  generatedAt: string;
  viewedUserId?: string;
  align?: "end" | "start";
};

export function DashboardRefreshControls({
  kind,
  generatedAt,
  viewedUserId,
  align = "end",
}: DashboardRefreshControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);

  const disabled = busy || isPending;
  const updatedLabel = justRefreshed
    ? "just now"
    : formatDashboardUpdatedAt(generatedAt);

  async function onRefresh() {
    setBusy(true);
    setError(null);
    try {
      const result = await refreshDashboardCache({ kind, viewedUserId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJustRefreshed(true);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Could not refresh. Showing last saved numbers.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={align === "end" ? "space-y-1 text-right" : "space-y-1"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={disabled}
        >
          {disabled ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        Updated {updatedLabel || "—"}
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
