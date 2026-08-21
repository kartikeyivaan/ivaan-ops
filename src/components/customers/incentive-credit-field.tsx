"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function IncentiveCreditField({
  customerId,
  value,
  canEdit,
}: {
  customerId: string;
  value: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function save() {
    setError(null);
    const parsed = Number(percent);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("Enter a number from 0 to 100.");
      return;
    }

    const response = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incentiveCreditPercent: parsed }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(body?.message ?? "Failed to update incentive credit %.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="incentiveCreditPercent">Incentive credit %</Label>
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            id="incentiveCreditPercent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            className="w-28"
            disabled={pending}
          />
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : (
        <p className="font-medium">{value}%</p>
      )}
      <p className="text-xs text-slate-500">
        Share of this firm&apos;s sales credited toward SE incentive KPIs. 0% excludes qty and
        value; 50% counts half. Default is 100%.
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
