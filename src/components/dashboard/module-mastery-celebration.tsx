"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import type { ModuleMasteryProgressDto } from "@/lib/sales-dashboard/dashboard-types";
import { formatCompactNumber } from "@/components/dashboard/dashboard-formatters";

export function ModuleMasteryCelebration({
  mastery,
}: {
  mastery: ModuleMasteryProgressDto;
}) {
  const [open, setOpen] = useState(false);
  const pending = mastery.pendingCelebrations;

  useEffect(() => {
    if (pending.length > 0) setOpen(true);
  }, [pending.length]);

  if (!open || pending.length === 0) return null;

  async function dismiss() {
    await fetch("/api/dashboard/module-mastery/celebrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: mastery.year, month: mastery.month }),
    }).catch(() => null);
    setOpen(false);
  }

  const multiple = pending.length > 1;
  const latest = pending[pending.length - 1];

  return (
    <Modal onClose={dismiss} size="md">
      <ModalHeader
        title={multiple ? "🔥 Amazing performance!" : "🎉 Level unlocked!"}
        description={
          multiple
            ? `${pending.length} levels unlocked this dispatch cycle`
            : "You crossed a new Module Mastery milestone"
        }
        onClose={dismiss}
      />
      <ModalBody className="space-y-4">
        {multiple ? (
          <ul className="space-y-2">
            {pending.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm"
              >
                <span className="text-emerald-600">✓</span>
                <span className="font-medium text-slate-800">{item.levelName}</span>
                <span className="text-slate-500">
                  · {formatCompactNumber(item.thresholdModules)} modules
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{latest.levelName}</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatCompactNumber(latest.thresholdModules)} modules dispatched
            </p>
          </div>
        )}

        <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">Month total</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCompactNumber(mastery.modulesDispatched)} modules
          </p>
        </div>

        <div className="rounded-md border border-slate-100 p-3 text-sm">
          <p className="text-slate-500">Next challenge</p>
          <p className="flex items-center gap-2 font-medium text-slate-900">
            <span>{mastery.nextLevelBadge}</span>
            {mastery.nextLevelName}
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={dismiss}>Continue</Button>
      </ModalFooter>
    </Modal>
  );
}
